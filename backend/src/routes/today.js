// E. Today — used by the elder's phone. These are the requests the prototype's log showed.

import { Router } from "express";
import { HttpError } from "../errors.js";
import { clock } from "../clock.js";
import { RULES } from "../config.js";
import { requireElderDevice } from "../auth.js";
import { localParts, localToMoment, friendlyTime, addDays } from "../time.js";
import { doseDayFor } from "../doseDay.js";
import { messageCaregivers } from "../notify.js";
import * as check from "../validate.js";

export function todayRoutes(db) {
  const router = Router();

  function elderOf(req) {
    return db.prepare("SELECT id, name, timezone, language, hospital_name, hospital_phone FROM elders WHERE id = ?").get(req.elderId);
  }

  // A stored moment ("2026-10-12T03:32:00Z") shown as the elder's local clock time ("09:02").
  function localTime(isoMoment, timezone) {
    return localParts(new Date(isoMoment), timezone).hhmm;
  }

  // GET /api/today — today's doses for this phone's elder, in time order
  router.get("/today", requireElderDevice, (req, res) => {
    const elder = elderOf(req);
    const local = localParts(clock.now(), elder.timezone);

    const now = clock.now();
    const rows = db
      .prepare(`SELECT s.id AS schedule_id, s.id, s.time_of_day, s.created_at, s.active_since, m.restarted_at,
                       m.name, m.strength, m.instruction, m.purpose, m.pill_shape, m.pill_color, m.pill_color2, m.photo_url
                FROM schedules s
                JOIN medicines m ON m.id = s.medicine_id
                WHERE m.elder_id = ? AND m.active = 1 AND s.active = 1
                ORDER BY s.time_of_day, m.name`)
      .all(elder.id)
      .map((r) => {
        // Usually today's dose. Last night's late dose stays on the list (carriedOver) until it's
        // marked or 6 hours have passed, so Kamala can still tap Taken after midnight.
        const day = doseDayFor(db, r, now, elder.timezone);
        const record = db.prepare("SELECT id, status, recorded_at FROM dose_log WHERE schedule_id = ? AND date = ?").get(r.id, day.date);
        return { ...r, ...day, dose_id: record?.id, status: record?.status, recorded_at: record?.recorded_at };
      });

    // The family this phone is connected to: first names, main caregivers first ("Priya", "Arjun")
    const family = db
      .prepare(`SELECT c.name FROM care_links l JOIN caregivers c ON c.id = l.caregiver_id
                WHERE l.elder_id = ? ORDER BY l.role = 'owner' DESC, c.name`)
      .all(elder.id)
      .map((c) => c.name.split(" ")[0]);

    res.json({
      elder: {
        id: elder.id, name: elder.name, family,
        language: elder.language,                                                // the app's language, chosen by the family
        hospital: elder.hospital_phone ? { name: elder.hospital_name ?? "", phone: elder.hospital_phone } : null, // for the emergency button
      },
      date: local.date,
      now: local.hhmm,
      doses: rows.map((r) => ({
        scheduleId: r.schedule_id,
        time: r.time_of_day,
        medicine: {
          name: r.name, strength: r.strength, instruction: r.instruction, purpose: r.purpose,
          pillShape: r.pill_shape, pillColor: r.pill_color, pillColor2: r.pill_color2, photoUrl: r.photo_url,
        },
        status: r.status ?? "pending",
        recordedAt: r.recorded_at ? localTime(r.recorded_at, elder.timezone) : null,
        doseId: r.dose_id ?? null,
        carriedOver: r.carriedOver, // true = this is yesterday's dose, still open
      })),
    });
  });

  // POST /api/doses — Kamala taps "Taken" (or "Skip")
  router.post("/doses", requireElderDevice, (req, res) => {
    const elder = elderOf(req);
    const scheduleId = check.id(req.body?.scheduleId, "dose");
    const status = check.oneOf(req.body?.status, ["taken", "skipped"], "status");

    const schedule = db
      .prepare(`SELECT s.id, s.time_of_day, s.active, s.created_at, s.active_since, m.restarted_at, m.elder_id, m.active AS medicine_active
                FROM schedules s JOIN medicines m ON m.id = s.medicine_id WHERE s.id = ?`)
      .get(scheduleId);
    // A phone can only record doses for its own elder. Anything else looks like "doesn't exist".
    if (!schedule || schedule.elder_id !== elder.id) throw new HttpError(404, "That dose doesn't exist.");
    if (!schedule.active || !schedule.medicine_active) throw new HttpError(400, "This medicine has been stopped.");

    // A tap made without internet arrives later, with the time it was really made (tappedAt).
    // We use that time, so the record says when Kamala took it, not when her phone got back online.
    const arrived = clock.now();
    let now = arrived;
    if (req.body?.tappedAt !== undefined) {
      const tapped = typeof req.body.tappedAt === "string" ? new Date(req.body.tappedAt) : new Date(NaN);
      if (Number.isNaN(tapped.getTime())) throw new HttpError(400, "That tap's time isn't valid.");
      if (arrived - tapped > RULES.OFFLINE_TAP_HOURS * 3_600_000) throw new HttpError(400, "That tap is too old to record.");
      // A phone whose clock runs ahead would give a time in the future: then the arrival time is the best we know.
      if (tapped <= arrived) now = tapped;
    }
    const local = localParts(now, elder.timezone);
    // Which day's dose is this tap for? Today's, or last night's if that one is still open (see doseDay.js).
    const day = doseDayFor(db, schedule, now, elder.timezone);
    const minutesUntilDue = (localToMoment(day.date, schedule.time_of_day, elder.timezone) - now) / 60_000;
    if (minutesUntilDue > RULES.EARLY_MINUTES) {
      throw new HttpError(400, `It's too early for this one. It's due at ${friendlyTime(schedule.time_of_day)}.`);
    }

    const existing = db.prepare("SELECT * FROM dose_log WHERE schedule_id = ? AND date = ?").get(scheduleId, day.date);
    if (existing && existing.status !== "missed") {
      const when = friendlyTime(localTime(existing.recorded_at, elder.timezone));
      throw new HttpError(409, `Already marked as ${existing.status} at ${when}.`);
    }

    if (existing) {
      // Taken late: it was marked missed (and caregivers were told), now update it.
      db.prepare("UPDATE dose_log SET status = ?, recorded_at = ?, recorded_by = 'elder' WHERE id = ?")
        .run(status, now.toISOString(), existing.id);
      // The family was told "missed", but she had tapped Taken before that, while her phone was offline: tell them.
      if (status === "taken" && now.toISOString() < existing.recorded_at) {
        const medicine = db.prepare("SELECT m.name FROM medicines m JOIN schedules s ON s.medicine_id = m.id WHERE s.id = ?").get(scheduleId);
        messageCaregivers(db, {
          elder, kind: "taken-offline",
          message: `${elder.name} did take ${medicine.name} (at ${friendlyTime(local.hhmm)}). The phone was offline, so GoldenDose only heard now.`,
        });
      }
      return res.status(200).json({ doseId: existing.id, status, recordedAt: local.hhmm, late: true });
    }

    try {
      const result = db
        .prepare("INSERT INTO dose_log (schedule_id, date, status, recorded_at, recorded_by) VALUES (?, ?, ?, ?, 'elder')")
        .run(scheduleId, day.date, status, now.toISOString());
      res.status(201).json({ doseId: Number(result.lastInsertRowid), status, recordedAt: local.hhmm });
    } catch (error) {
      // Two taps arrived at the same instant: the database's UNIQUE rule stopped the second one.
      if (String(error.message).includes("UNIQUE")) throw new HttpError(409, "Already marked.");
      throw error;
    }
  });

  // DELETE /api/doses/:id — Undo, allowed for 5 minutes
  router.delete("/doses/:id", requireElderDevice, (req, res) => {
    const elder = elderOf(req);
    const doseId = check.id(req.params.id, "dose");
    const dose = db
      .prepare(`SELECT d.*, m.elder_id FROM dose_log d
                JOIN schedules s ON s.id = d.schedule_id JOIN medicines m ON m.id = s.medicine_id
                WHERE d.id = ?`)
      .get(doseId);
    if (!dose || dose.elder_id !== elder.id) throw new HttpError(404, "That record doesn't exist.");
    if (dose.status === "missed") throw new HttpError(409, "There's nothing to undo.");

    const now = clock.now();
    const ageMinutes = (now - new Date(dose.recorded_at)) / 60_000;
    // (Only the 5 minutes count. The dose's own day may be yesterday: a late-evening dose marked after midnight.)
    if (ageMinutes > RULES.UNDO_MINUTES || dose.date < addDays(localParts(now, elder.timezone).date, -1)) {
      throw new HttpError(409, "This can no longer be undone.");
    }

    const caregiversWereTold = db.prepare("SELECT 1 FROM notifications WHERE dose_log_id = ?").get(dose.id);
    if (caregiversWereTold) {
      // It had been missed before it was taken late. Go back to "missed" and keep the record of who was told.
      db.prepare("UPDATE dose_log SET status = 'missed', recorded_at = ?, recorded_by = 'system' WHERE id = ?")
        .run(now.toISOString(), dose.id);
    } else {
      // Back to "not marked yet". If it's now 30+ minutes late, the missed-dose check will alert caregivers.
      db.prepare("DELETE FROM dose_log WHERE id = ?").run(dose.id);
    }
    res.status(204).end();
  });

  return router;
}
