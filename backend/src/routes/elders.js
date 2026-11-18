// B. Elders and caregivers: add an elder, invite a caregiver, pairing codes, alert choices, history,
//    the elder's language, emergency hospital and chemist, and emergency button presses.

import { Router } from "express";
import { HttpError } from "../errors.js";
import { transaction } from "../db.js";
import { clock } from "../clock.js";
import { RULES, LANGUAGES, photosDir, prescriptionsDir } from "../config.js";
import { rmSync } from "node:fs";
import { join, basename } from "node:path";
import { requireCaregiver, careLinkOrFail, newPairingCode } from "../auth.js";
import { isValidTimeZone } from "../time.js";
import * as check from "../validate.js";
import { recordChange } from "../changes.js";

// Database rows store yes/no as 1/0. The API speaks true/false.
function alertsJSON(link) {
  return { sms: link.notify_sms === 1, whatsapp: link.notify_whatsapp === 1, app: link.notify_app === 1 };
}

// The family's settings for one elder: their app's language, the hospital to call, and their chemist.
function profileJSON(row) {
  return {
    language: row.language,
    hospital: { name: row.hospital_name ?? "", phone: row.hospital_phone ?? "" },
    chemist: { name: row.chemist_name ?? "", phone: row.chemist_phone ?? "", leadDays: row.chemist_lead_days },
    requireApproval: row.require_approval === 1, // helpers' medicine changes wait for the main caregiver's OK
  };
}

export function elderRoutes(db) {
  const router = Router();
  router.use("/elders", requireCaregiver); // every route below needs a signed-in caregiver

  // GET /api/elders — the elders I look after
  router.get("/elders", (req, res) => {
    const rows = db
      .prepare(`SELECT e.id, e.name, e.timezone, e.language, e.hospital_name, e.hospital_phone, e.chemist_name, e.chemist_phone,
                       e.chemist_lead_days, e.require_approval,
                       l.role, l.notify_sms, l.notify_whatsapp, l.notify_app
                FROM care_links l JOIN elders e ON e.id = l.elder_id
                WHERE l.caregiver_id = ? ORDER BY e.name`)
      .all(req.caregiverId);
    res.json(rows.map((r) => ({ id: r.id, name: r.name, timezone: r.timezone, role: r.role, myAlerts: alertsJSON(r), ...profileJSON(r) })));
  });

  // POST /api/elders — add an elder; I become their owner
  router.post("/elders", (req, res) => {
    const name = check.text(req.body?.name, "name", { max: 100 });
    const timezone = req.body?.timezone ?? "Asia/Kolkata";
    if (!isValidTimeZone(timezone)) throw new HttpError(400, `"${timezone}" isn't a known timezone.`);

    const elderId = transaction(db, () => {
      const result = db.prepare("INSERT INTO elders (name, timezone) VALUES (?, ?)").run(name, timezone);
      const elderId = Number(result.lastInsertRowid);
      db.prepare("INSERT INTO care_links (caregiver_id, elder_id, role) VALUES (?, ?, 'owner')").run(req.caregiverId, elderId);
      return elderId;
    });

    const row = db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId);
    res.status(201).json({ id: elderId, name, timezone, role: "owner", myAlerts: { sms: true, whatsapp: true, app: true }, ...profileJSON(row) });
  });

  // POST /api/elders/:id/pairing-code — a 6-digit code to pair the elder's phone
  router.post("/elders/:id/pairing-code", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);

    const expiresAt = new Date(clock.now().getTime() + RULES.PAIRING_CODE_MINUTES * 60_000).toISOString();
    // Codes must be unique among elders, so try again in the rare case of a clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newPairingCode();
      try {
        db.prepare("UPDATE elders SET pairing_code = ?, pairing_code_expires_at = ? WHERE id = ?").run(code, expiresAt, elderId);
        return res.status(201).json({ code, expiresAt });
      } catch (error) {
        if (!String(error.message).includes("UNIQUE")) throw error;
      }
    }
    throw new HttpError(500, "Couldn't make a pairing code. Try again.");
  });

  // POST /api/elders/:id/caregivers — invite another caregiver (owner only)
  router.post("/elders/:id/caregivers", (req, res) => {
    const elderId = check.id(req.params.id);
    const myLink = careLinkOrFail(db, req.caregiverId, elderId);
    if (myLink.role !== "owner") throw new HttpError(403, "Only the main caregiver can invite others.");

    const email = check.email(req.body?.email);
    const role = check.oneOf(req.body?.role ?? "helper", ["owner", "helper"], "role");
    const invitee = db.prepare("SELECT id, name FROM caregivers WHERE email = ?").get(email);
    if (!invitee) throw new HttpError(404, "No GoldenDose account uses that email. Ask them to sign up first.");

    const already = db.prepare("SELECT id FROM care_links WHERE caregiver_id = ? AND elder_id = ?").get(invitee.id, elderId);
    if (already) throw new HttpError(409, `${invitee.name} already looks after this person.`);

    db.prepare("INSERT INTO care_links (caregiver_id, elder_id, role) VALUES (?, ?, ?)").run(invitee.id, elderId, role);
    recordChange(db, { elderId, caregiverId: req.caregiverId, action: "family", summary: `Invited ${invitee.name} as ${role === "owner" ? "a main caregiver" : "a helper"}` });
    res.status(201).json({ caregiver: { id: invitee.id, name: invitee.name }, role });
  });

  // PUT /api/elders/:id/my-alerts — how I want to hear about missed doses for this elder
  router.put("/elders/:id/my-alerts", (req, res) => {
    const elderId = check.id(req.params.id);
    const link = careLinkOrFail(db, req.caregiverId, elderId);
    const sms = check.boolean(req.body?.sms, "SMS");
    const whatsapp = check.boolean(req.body?.whatsapp, "WhatsApp");
    const app = check.boolean(req.body?.app, "app notification");

    db.prepare("UPDATE care_links SET notify_sms = ?, notify_whatsapp = ?, notify_app = ? WHERE id = ?")
      .run(Number(sms), Number(whatsapp), Number(app), link.id);
    res.json({ elderId, sms, whatsapp, app });
  });

  // PUT /api/elders/:id/profile — the elder's app language, emergency hospital, chemist, and whether
  // helpers' changes need approval. Any caregiver can change these, except approval (main caregiver only).
  // Only the fields sent are changed.
  router.put("/elders/:id/profile", (req, res) => {
    const elderId = check.id(req.params.id);
    const link = careLinkOrFail(db, req.caregiverId, elderId);
    const row = db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId);
    const body = req.body ?? {};
    const pick = (value, current, clean) => (value === undefined ? current : clean(value));
    const language = pick(body.language, row.language, (v) => check.oneOf(v, LANGUAGES, "language"));
    const hospitalName = pick(body.hospital?.name, row.hospital_name, (v) => check.text(v, "hospital name", { max: 100, required: false }) || null);
    const hospitalPhone = pick(body.hospital?.phone, row.hospital_phone, (v) => check.phone(v, "hospital phone number"));
    const chemistName = pick(body.chemist?.name, row.chemist_name, (v) => check.text(v, "chemist's name", { max: 100, required: false }) || null);
    const chemistPhone = pick(body.chemist?.phone, row.chemist_phone, (v) => check.phone(v, "chemist's WhatsApp number"));
    const leadDays = pick(body.chemist?.leadDays, row.chemist_lead_days, (v) => Math.round(check.number(v, "days the chemist needs", { min: 0, max: 30 })));
    const approval = pick(body.requireApproval, row.require_approval === 1, (v) => check.boolean(v, "approval"));
    if (approval !== (row.require_approval === 1) && link.role !== "owner") {
      throw new HttpError(403, "Only the main caregiver can change who approves medicine changes.");
    }

    db.prepare(`UPDATE elders SET language = ?, hospital_name = ?, hospital_phone = ?, chemist_name = ?, chemist_phone = ?,
                chemist_lead_days = ?, require_approval = ? WHERE id = ?`)
      .run(language, hospitalName, hospitalPhone, chemistName, chemistPhone, leadDays, Number(approval), elderId);

    // The change history, in words
    const said = [];
    if (language !== row.language) said.push(`app language → ${language}`);
    if (hospitalName !== row.hospital_name || hospitalPhone !== row.hospital_phone) said.push(`hospital → ${hospitalName || hospitalPhone || "none"}`);
    if (chemistName !== row.chemist_name || chemistPhone !== row.chemist_phone) said.push(`chemist → ${chemistName || chemistPhone || "none"}`);
    if (leadDays !== row.chemist_lead_days) said.push(`chemist needs ${leadDays} day${leadDays === 1 ? "" : "s"}`);
    if (approval !== (row.require_approval === 1)) said.push(approval ? "helpers' changes now need approval" : "helpers' changes no longer need approval");
    if (said.length) recordChange(db, { elderId, caregiverId: req.caregiverId, action: "details", summary: `Changed settings: ${said.join("; ")}` });

    res.json(profileJSON(db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId)));
  });

  // DELETE /api/elders/:id/devices — "Disconnect this phone": every phone connected to this elder stops
  // working at once (for a lost, stolen or given-away phone). It can be connected again with a new code.
  router.delete("/elders/:id/devices", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const elder = db.prepare("SELECT name FROM elders WHERE id = ?").get(elderId);
    const { changes } = db.prepare("DELETE FROM devices WHERE elder_id = ?").run(elderId);
    if (changes > 0) {
      recordChange(db, { elderId, caregiverId: req.caregiverId, action: "phone", summary: `Disconnected ${elder.name}'s phone` });
    }
    res.json({ disconnected: Number(changes) });
  });

  // DELETE /api/elders/:id/me — "Remove from my list".
  // If others in the family look after this person, I just stop (they carry on, and if I was the only main
  // caregiver, the longest-standing helper becomes one). If I'm the only one, the person and all their records
  // are deleted, their phone is disconnected, and their photos and prescriptions are removed from this computer.
  router.delete("/elders/:id/me", (req, res) => {
    const elderId = check.id(req.params.id);
    const myLink = careLinkOrFail(db, req.caregiverId, elderId);
    const elder = db.prepare("SELECT name FROM elders WHERE id = ?").get(elderId);
    const me = db.prepare("SELECT name FROM caregivers WHERE id = ?").get(req.caregiverId);
    const others = db
      .prepare(`SELECT l.id, l.role, c.name FROM care_links l JOIN caregivers c ON c.id = l.caregiver_id
                WHERE l.elder_id = ? AND l.caregiver_id != ? ORDER BY l.id`)
      .all(elderId, req.caregiverId);

    if (others.length === 0) {
      const photos = db.prepare("SELECT photo_url FROM medicines WHERE elder_id = ? AND photo_url IS NOT NULL").all(elderId);
      // Every file kept for this person: prescriptions, blood reports, and photos still waiting for approval.
      const files = [
        ...db.prepare("SELECT file_name FROM prescriptions WHERE elder_id = ?").all(elderId),
        ...db.prepare("SELECT file_name FROM lab_reports WHERE elder_id = ? AND file_name IS NOT NULL").all(elderId),
      ];
      const waitingPhotos = db.prepare("SELECT request FROM pending_changes WHERE elder_id = ?").all(elderId)
        .map((p) => JSON.parse(p.request).photoUrl).filter(Boolean);
      db.prepare("DELETE FROM elders WHERE id = ?").run(elderId); // medicines, history, phones… go with it (ON DELETE CASCADE)
      for (const p of photos) rmSync(join(photosDir(), basename(p.photo_url)), { force: true });
      for (const url of waitingPhotos) rmSync(join(photosDir(), basename(url)), { force: true });
      for (const f of files) rmSync(join(prescriptionsDir(), basename(f.file_name)), { force: true });
      return res.json({ removed: "person", name: elder.name });
    }

    let newMain = null;
    transaction(db, () => {
      db.prepare("DELETE FROM care_links WHERE id = ?").run(myLink.id);
      if (myLink.role === "owner" && !others.some((o) => o.role === "owner")) {
        newMain = others[0];
        db.prepare("UPDATE care_links SET role = 'owner' WHERE id = ?").run(newMain.id);
      }
      recordChange(db, {
        elderId, caregiverId: req.caregiverId, action: "family",
        summary: `${me.name} stopped looking after ${elder.name}${newMain ? `; ${newMain.name} is now the main caregiver` : ""}`,
      });
    });
    res.json({ removed: "me", name: elder.name, newMainCaregiver: newMain?.name ?? null });
  });

  // GET /api/elders/:id/emergencies — emergency button presses in the last 7 days, newest first
  router.get("/elders/:id/emergencies", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const since = new Date(clock.now().getTime() - 7 * 86_400_000).toISOString();
    const rows = db
      .prepare("SELECT * FROM emergencies WHERE elder_id = ? AND created_at >= ? ORDER BY created_at DESC")
      .all(elderId, since);
    res.json(rows.map((r) => ({
      id: r.id, at: r.created_at, cancelledAt: r.cancelled_at,
      location: r.latitude === null ? null : { latitude: r.latitude, longitude: r.longitude },
    })));
  });

  // GET /api/elders/:id/history?from=2026-10-06&to=2026-10-12
  router.get("/elders/:id/history", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const from = check.date(req.query.from, "from");
    const to = check.date(req.query.to, "to");
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0) throw new HttpError(400, "The 'from' date must be before the 'to' date.");
    if (days > RULES.HISTORY_MAX_DAYS) throw new HttpError(400, `Ask for at most ${RULES.HISTORY_MAX_DAYS} days at a time.`);

    const rows = db
      .prepare(`SELECT d.id, d.date, s.time_of_day, d.status, d.recorded_at, d.recorded_by, m.id AS medicine_id, m.name, m.strength
                FROM dose_log d
                JOIN schedules s ON s.id = d.schedule_id
                JOIN medicines m ON m.id = s.medicine_id
                WHERE m.elder_id = ? AND d.date BETWEEN ? AND ?
                ORDER BY d.date, s.time_of_day`)
      .all(elderId, from, to);

    res.json(rows.map((r) => ({
      doseId: r.id, date: r.date, time: r.time_of_day, status: r.status,
      recordedAt: r.recorded_at, recordedBy: r.recorded_by,
      medicine: { id: r.medicine_id, name: r.name, strength: r.strength },
    })));
  });

  return router;
}
