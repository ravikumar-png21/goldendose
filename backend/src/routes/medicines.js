// D. Medicines (caregiver): list, add, change, stop, the medicine meter (tablets left),
//    what each medicine is usually for, and the main caregiver's approval of helpers' changes.

import express, { Router } from "express";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { HttpError } from "../errors.js";
import { transaction } from "../db.js";
import { clock } from "../clock.js";
import { photosDir } from "../config.js";
import { meterFor } from "../stock.js";
import { lookUpMedicine, MEDICINE_INFO_NOTE } from "../medicine-info.js";
import { medicineSnapshot, describeDifference, describeNewMedicine, recordChange, medicineLabel } from "../changes.js";
import { messageCaregivers } from "../notify.js";
import { requireCaregiver, careLinkOrFail } from "../auth.js";
import * as check from "../validate.js";
import { fileKind } from "./prescriptions.js";

const SHAPES = ["round", "oval", "capsule"];

// A pill photo must be a picture: the same first-bytes check as prescriptions (fileKind), minus PDFs.
function imageKind(bytes) {
  const kind = fileKind(bytes);
  return kind === "pdf" ? null : kind;
}

export function medicineRoutes(db) {
  const router = Router();

  // Turns a database row into the shape the API promises (see docs/API-DESIGN.md).
  function medicineJSON(row) {
    const schedules = db
      .prepare("SELECT id, time_of_day FROM schedules WHERE medicine_id = ? AND active = 1 ORDER BY time_of_day")
      .all(row.id);
    const { timezone } = db.prepare("SELECT timezone FROM elders WHERE id = ?").get(row.elder_id);
    return {
      id: row.id,
      elderId: row.elder_id,
      name: row.name,
      strength: row.strength,
      instruction: row.instruction,
      purpose: row.purpose,
      hardToGet: row.hard_to_get === 1,
      pillShape: row.pill_shape,
      pillColor: row.pill_color,
      pillColor2: row.pill_color2,
      photoUrl: row.photo_url,
      active: row.active === 1,
      schedules: schedules.map((s) => ({ id: s.id, time: s.time_of_day })),
      // About how many tablets and days are left, or null if nobody has counted them.
      stock: row.active === 1 ? meterFor(db, row, schedules.map((s) => s.time_of_day), timezone, clock.now()) : null,
    };
  }

  // Makes the medicine's active times match the new list.
  // Times no longer wanted are switched off, not deleted, because past doses point to them.
  function syncTimes(medicineId, wantedTimes) {
    const existing = db.prepare("SELECT id, time_of_day, active FROM schedules WHERE medicine_id = ?").all(medicineId);
    for (const time of wantedTimes) {
      const match = existing.find((s) => s.time_of_day === time);
      if (!match) {
        db.prepare("INSERT INTO schedules (medicine_id, time_of_day, created_at, active_since) VALUES (?, ?, ?, ?)")
          .run(medicineId, time, clock.now().toISOString(), clock.now().toISOString());
      } else if (match.active === 0) {
        // Switched on again: it counts from now, so the days it was off aren't "missed".
        db.prepare("UPDATE schedules SET active = 1, active_since = ? WHERE id = ?").run(clock.now().toISOString(), match.id);
      }
    }
    for (const schedule of existing) {
      if (schedule.active === 1 && !wantedTimes.includes(schedule.time_of_day)) {
        db.prepare("UPDATE schedules SET active = 0 WHERE id = ?").run(schedule.id);
      }
    }
  }

  // Finds a medicine and checks the caller looks after its elder. Also returns the caller's care link.
  function medicineOrFail(req) {
    const medicineId = check.id(req.params.id, "medicine");
    const row = db.prepare("SELECT * FROM medicines WHERE id = ?").get(medicineId);
    if (!row) throw new HttpError(404, "That medicine doesn't exist.");
    const link = careLinkOrFail(db, req.caregiverId, row.elder_id);
    return { row, link };
  }

  // ---------- Checking what was sent, then applying it ----------
  // Kept apart, so a helper's change can be checked now and applied later, when it's approved.

  function checkNewMedicine(body) {
    return {
      name: check.text(body.name, "medicine name", { max: 100 }),
      strength: check.text(body.strength, "strength", { max: 50, required: false }),
      instruction: check.text(body.instruction, "instruction", { max: 200, required: false }),
      purpose: check.text(body.purpose, "what it's for", { max: 100, required: false }),
      hardToGet: body.hardToGet === undefined ? false : check.boolean(body.hardToGet, "hard to get"),
      pillShape: check.oneOf(body.pillShape ?? "round", SHAPES, "pill shape"),
      pillColor: check.color(body.pillColor ?? "#FFFFFF", "pill colour"),
      pillColor2: body.pillColor2 == null ? null : check.color(body.pillColor2, "second pill colour"),
      times: check.times(body.times),
    };
  }

  function checkChanges(row, body) {
    const keep = (field, current, clean) => (body[field] === undefined ? current : clean(body[field]));
    return {
      name: keep("name", row.name, (v) => check.text(v, "medicine name", { max: 100 })),
      strength: keep("strength", row.strength, (v) => check.text(v, "strength", { max: 50, required: false })),
      instruction: keep("instruction", row.instruction, (v) => check.text(v, "instruction", { max: 200, required: false })),
      purpose: keep("purpose", row.purpose, (v) => check.text(v, "what it's for", { max: 100, required: false })),
      hardToGet: keep("hardToGet", row.hard_to_get === 1, (v) => check.boolean(v, "hard to get")),
      pillShape: keep("pillShape", row.pill_shape, (v) => check.oneOf(v, SHAPES, "pill shape")),
      pillColor: keep("pillColor", row.pill_color, (v) => check.color(v, "pill colour")),
      pillColor2: body.pillColor2 === undefined ? row.pill_color2 : body.pillColor2 === null ? null : check.color(body.pillColor2, "second pill colour"),
      times: body.times === undefined ? null : check.times(body.times),
    };
  }

  function addMedicine(elderId, v) {
    return transaction(db, () => {
      const result = db
        .prepare(`INSERT INTO medicines (elder_id, name, strength, instruction, purpose, hard_to_get, pill_shape, pill_color, pill_color2)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(elderId, v.name, v.strength, v.instruction, v.purpose, Number(v.hardToGet), v.pillShape, v.pillColor, v.pillColor2);
      const medicineId = Number(result.lastInsertRowid);
      syncTimes(medicineId, v.times);
      return medicineId;
    });
  }

  function changeMedicine(medicineId, v) {
    transaction(db, () => {
      db.prepare(`UPDATE medicines SET name = ?, strength = ?, instruction = ?, purpose = ?, hard_to_get = ?,
                  pill_shape = ?, pill_color = ?, pill_color2 = ?,
                  restarted_at = CASE WHEN active = 0 THEN ? ELSE restarted_at END, active = 1 WHERE id = ?`)
        .run(v.name, v.strength, v.instruction, v.purpose, Number(v.hardToGet), v.pillShape, v.pillColor, v.pillColor2,
          clock.now().toISOString(), medicineId); // a stopped medicine that is started again counts from now
      if (v.times) syncTimes(medicineId, v.times);
    });
  }

  // Makes this file the medicine's photo, and removes the photo it replaces.
  function usePhoto(row, photoUrl) {
    if (row.photo_url && row.photo_url !== photoUrl) rmSync(join(photosDir(), basename(row.photo_url)), { force: true });
    db.prepare("UPDATE medicines SET photo_url = ? WHERE id = ?").run(photoUrl, row.id);
  }

  function stopMedicine(medicineId) {
    db.prepare("UPDATE medicines SET active = 0 WHERE id = ?").run(medicineId);
  }

  // What a change would do, in words, without doing it: "times 8:00 am → 9:00 am".
  function previewDifference(row, v) {
    const before = medicineSnapshot(db, row.id);
    const after = { ...before, ...v, times: v.times ?? before.times, active: true };
    return describeDifference(before, after);
  }

  // Does this helper's change need the main caregiver's OK? Only if the family switched approval on.
  function needsApproval(link) {
    const elder = db.prepare("SELECT require_approval FROM elders WHERE id = ?").get(link.elder_id);
    return elder.require_approval === 1 && link.role !== "owner";
  }

  // Saves the change as "waiting", tells the main caregivers, and replies 202 ("accepted, not done yet").
  function waitForApproval(req, res, { elderId, medicineId = null, action, request, summary, reason }) {
    const at = clock.now().toISOString();
    const result = db
      .prepare(`INSERT INTO pending_changes (elder_id, caregiver_id, medicine_id, action, request, summary, reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(elderId, req.caregiverId, medicineId, action, JSON.stringify(request), summary, reason, at);
    const me = db.prepare("SELECT name FROM caregivers WHERE id = ?").get(req.caregiverId);
    const elder = db.prepare("SELECT id, name FROM elders WHERE id = ?").get(elderId);
    messageCaregivers(db, {
      elder, kind: "approval-needed", ownersOnly: true,
      message: `${me.name} wants to ${summary} for ${elder.name}. Open GoldenDose to approve or reject.`,
    });
    res.status(202).json({ pending: true, pendingId: Number(result.lastInsertRowid), summary });
  }

  const reasonOf = (body) => check.text(body?.reason, "reason", { max: 200, required: false });

  // ---------- The routes ----------

  // GET /api/medicine-info?name=Glycomet%20500 — what a medicine is usually for (general information)
  router.get("/medicine-info", requireCaregiver, (req, res) => {
    const found = lookUpMedicine(req.query.name);
    res.json(found ? { ...found, note: MEDICINE_INFO_NOTE } : null);
  });

  // GET /api/elders/:id/medicines  (add ?includeStopped=true to also see stopped ones)
  router.get("/elders/:id/medicines", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const includeStopped = req.query.includeStopped === "true";
    const rows = db
      .prepare(`SELECT * FROM medicines WHERE elder_id = ? ${includeStopped ? "" : "AND active = 1"} ORDER BY name`)
      .all(elderId);
    res.json(rows.map(medicineJSON));
  });

  // POST /api/elders/:id/medicines
  router.post("/elders/:id/medicines", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    const link = careLinkOrFail(db, req.caregiverId, elderId);
    const values = checkNewMedicine(req.body ?? {});
    const reason = reasonOf(req.body);

    if (needsApproval(link)) {
      return waitForApproval(req, res, {
        elderId, action: "add", request: values, reason, summary: `add ${describeNewMedicine(values)}`,
      });
    }
    const medicineId = addMedicine(elderId, values);
    const after = medicineSnapshot(db, medicineId);
    recordChange(db, { elderId, caregiverId: req.caregiverId, medicineId, action: "added", summary: `Added ${describeNewMedicine(after)}`, reason, after });
    res.status(201).json(medicineJSON(db.prepare("SELECT * FROM medicines WHERE id = ?").get(medicineId)));
  });

  // PUT /api/medicines/:id — change any of the details. Only the fields sent are changed.
  router.put("/medicines/:id", requireCaregiver, (req, res) => {
    const { row, link } = medicineOrFail(req);
    const values = checkChanges(row, req.body ?? {});
    const reason = reasonOf(req.body);
    const difference = previewDifference(row, values);

    if (needsApproval(link) && difference) {
      return waitForApproval(req, res, {
        elderId: row.elder_id, medicineId: row.id, action: "change", request: values, reason,
        summary: `change ${medicineLabel(row)}: ${difference}`,
      });
    }
    changeMedicine(row.id, values);
    if (difference) {
      recordChange(db, {
        elderId: row.elder_id, caregiverId: req.caregiverId, medicineId: row.id, action: "changed",
        summary: `Changed ${medicineLabel(row)}: ${difference}`, reason, after: medicineSnapshot(db, row.id),
      });
    }
    res.json(medicineJSON(db.prepare("SELECT * FROM medicines WHERE id = ?").get(row.id)));
  });

  // POST /api/medicines/:id/photo — the body is the image itself (JPEG, PNG or WebP, up to 5 MB)
  router.post(
    "/medicines/:id/photo",
    requireCaregiver,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
    (req, res) => {
      const { row, link } = medicineOrFail(req);
      const image = req.body;
      if (!Buffer.isBuffer(image) || image.length === 0) {
        throw new HttpError(400, "Choose a photo in JPEG, PNG or WebP format.");
      }
      // Don't trust the label: check the file's first bytes really are an image of that kind.
      const kind = imageKind(image);
      if (!kind) throw new HttpError(400, "That file isn't a photo GoldenDose can use. Try a JPEG or PNG.");

      const folder = photosDir();
      mkdirSync(folder, { recursive: true });
      // A random name, so photo addresses can't be guessed.
      const fileName = `${row.id}-${randomBytes(12).toString("hex")}.${kind}`;
      writeFileSync(join(folder, fileName), image);

      // A helper's new photo, while the family asked for approval: keep the file, but the medicine keeps
      // its old photo until the main caregiver says yes. (Kamala picks her tablet by this picture.)
      if (needsApproval(link)) {
        return waitForApproval(req, res, {
          elderId: row.elder_id, medicineId: row.id, action: "change", request: { photoUrl: `/photos/${fileName}` },
          reason: "", summary: `change the photo of ${medicineLabel(row)}`,
        });
      }
      usePhoto(row, `/photos/${fileName}`);
      recordChange(db, {
        elderId: row.elder_id, caregiverId: req.caregiverId, medicineId: row.id, action: "photo",
        summary: `${row.photo_url ? "Changed" : "Added"} the photo of ${medicineLabel(row)}`,
      });
      res.status(201).json(medicineJSON(db.prepare("SELECT * FROM medicines WHERE id = ?").get(row.id)));
    },
  );

  // PUT /api/medicines/:id/stock — "I counted: 30 tablets left, 1 per dose." Starts (or restarts) the meter.
  // Send tabletsLeft: null to switch the meter off for this medicine.
  router.put("/medicines/:id/stock", requireCaregiver, (req, res) => {
    const { row } = medicineOrFail(req);
    const body = req.body ?? {};
    let summary;
    if (body.tabletsLeft === null) {
      db.prepare("UPDATE medicines SET stock_count = NULL, stock_counted_at = NULL, stock_alerted_at = NULL WHERE id = ?").run(row.id);
      summary = `Switched off the medicine meter for ${medicineLabel(row)}`;
    } else {
      const tabletsLeft = check.number(body.tabletsLeft, "number of tablets left", { min: 0, max: 5000 });
      const perDose = body.perDose === undefined ? row.per_dose : check.number(body.perDose, "tablets per dose", { min: 0.25, max: 20 });
      // A new count also means the family will be told again when this new stock runs low.
      db.prepare("UPDATE medicines SET stock_count = ?, per_dose = ?, stock_counted_at = ?, stock_alerted_at = NULL WHERE id = ?")
        .run(tabletsLeft, perDose, clock.now().toISOString(), row.id);
      summary = `Counted ${tabletsLeft} tablets of ${medicineLabel(row)} (${perDose} per dose)`;
    }
    recordChange(db, { elderId: row.elder_id, caregiverId: req.caregiverId, medicineId: row.id, action: "counted", summary });
    res.json(medicineJSON(db.prepare("SELECT * FROM medicines WHERE id = ?").get(row.id)));
  });

  // DELETE /api/medicines/:id — stop a medicine. Kept in the database so history still makes sense.
  // A reason can be sent as ?reason=... (a DELETE request has no body in some browsers).
  router.delete("/medicines/:id", requireCaregiver, (req, res) => {
    const { row, link } = medicineOrFail(req);
    const reason = check.text(req.query.reason, "reason", { max: 200, required: false });
    if (needsApproval(link)) {
      return waitForApproval(req, res, {
        elderId: row.elder_id, medicineId: row.id, action: "stop", request: {}, reason, summary: `stop ${medicineLabel(row)}`,
      });
    }
    stopMedicine(row.id);
    recordChange(db, {
      elderId: row.elder_id, caregiverId: req.caregiverId, medicineId: row.id, action: "stopped",
      summary: `Stopped ${medicineLabel(row)}`, reason, after: medicineSnapshot(db, row.id),
    });
    res.status(204).end();
  });

  // ---------- Approving helpers' changes (main caregiver only) ----------

  function pendingJSON(p) {
    return {
      id: p.id, elderId: p.elder_id, medicineId: p.medicine_id, action: p.action, summary: p.summary, reason: p.reason,
      status: p.status, requestedBy: p.requester, requestedAt: p.created_at, decidedAt: p.decided_at,
      photoUrl: JSON.parse(p.request).photoUrl ?? null, // a new photo waiting for approval, so it can be looked at first
    };
  }

  // GET /api/elders/:id/pending-changes — changes waiting for the main caregiver
  router.get("/elders/:id/pending-changes", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const rows = db
      .prepare(`SELECT p.*, c.name AS requester FROM pending_changes p JOIN caregivers c ON c.id = p.caregiver_id
                WHERE p.elder_id = ? AND p.status = 'waiting' ORDER BY p.created_at`)
      .all(elderId);
    res.json(rows.map(pendingJSON));
  });

  // POST /api/pending-changes/:id/approve  or  /reject
  router.post("/pending-changes/:id/:decision", requireCaregiver, (req, res) => {
    const decision = check.oneOf(req.params.decision, ["approve", "reject"], "decision");
    const pending = db
      .prepare("SELECT p.*, c.name AS requester FROM pending_changes p JOIN caregivers c ON c.id = p.caregiver_id WHERE p.id = ?")
      .get(check.id(req.params.id, "change"));
    if (!pending) throw new HttpError(404, "That change doesn't exist.");
    const link = careLinkOrFail(db, req.caregiverId, pending.elder_id);
    if (link.role !== "owner") throw new HttpError(403, "Only the main caregiver can approve changes.");
    if (pending.status !== "waiting") throw new HttpError(409, `This change was already ${pending.status}.`);

    const me = db.prepare("SELECT name FROM caregivers WHERE id = ?").get(req.caregiverId);
    const values = JSON.parse(pending.request);
    let medicineId = pending.medicine_id;

    transaction(db, () => {
      if (decision === "approve") {
        if (pending.action === "add") {
          medicineId = addMedicine(pending.elder_id, values);
        } else {
          const row = db.prepare("SELECT * FROM medicines WHERE id = ?").get(medicineId);
          if (!row) throw new HttpError(409, "That medicine no longer exists.");
          if (values.photoUrl) usePhoto(row, values.photoUrl);            // a new photo
          else if (pending.action === "change") changeMedicine(medicineId, values);
          else stopMedicine(medicineId);
        }
      } else if (values.photoUrl) {
        rmSync(join(photosDir(), basename(values.photoUrl)), { force: true }); // rejected: the waiting photo isn't kept
      }
      db.prepare("UPDATE pending_changes SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?")
        .run(decision === "approve" ? "approved" : "rejected", req.caregiverId, clock.now().toISOString(), pending.id);
      // "change Metformin: …" becomes "Changed Metformin: …"
      const what = pending.summary.replace(/^(add|change|stop)\b/, (verb) => ({ add: "Added", change: "Changed", stop: "Stopped" })[verb]);
      recordChange(db, {
        elderId: pending.elder_id, caregiverId: pending.caregiver_id, medicineId,
        action: decision === "approve" ? { add: "added", change: "changed", stop: "stopped" }[pending.action] : "rejected",
        summary: decision === "approve" ? `${what} (approved by ${me.name})` : `Wanted to ${pending.summary} (rejected by ${me.name})`,
        reason: pending.reason,
        after: decision === "approve" && medicineId ? medicineSnapshot(db, medicineId) : null,
      });
    });
    res.json({ id: pending.id, status: decision === "approve" ? "approved" : "rejected", medicineId });
  });

  return router;
}
