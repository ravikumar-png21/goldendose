// F. The emergency button on the elder's phone.
//
// One tap does two things at once: the phone shows big buttons to call the ambulance (108) or the
// family's chosen hospital, and this route tells EVERY caregiver straight away, on every channel,
// with a map link if the phone shared its location. If it was a mistake, "I'm OK" tells them that too.

import { Router } from "express";
import { HttpError } from "../errors.js";
import { clock } from "../clock.js";
import { RULES } from "../config.js";
import { requireElderDevice } from "../auth.js";
import { localParts, friendlyTime } from "../time.js";
import { messageCaregivers } from "../notify.js";
import * as check from "../validate.js";

export function emergencyRoutes(db) {
  const router = Router();

  // POST /api/emergency  { latitude?, longitude? }
  router.post("/emergency", requireElderDevice, (req, res) => {
    const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(req.elderId);
    const body = req.body ?? {};
    let latitude = null;
    let longitude = null;
    if (body.latitude !== undefined && body.latitude !== null) {
      latitude = check.number(body.latitude, "latitude", { min: -90, max: 90 });
      longitude = check.number(body.longitude, "longitude", { min: -180, max: 180 });
    }

    const now = clock.now();

    // Pressed again within a few minutes, and nobody has said "I'm OK" yet: it's the same emergency.
    // The family was already told on every channel, so count the press but don't message them again.
    const since = new Date(now.getTime() - RULES.EMERGENCY_GROUP_MINUTES * 60_000).toISOString();
    const open = db
      .prepare("SELECT * FROM emergencies WHERE elder_id = ? AND cancelled_at IS NULL AND created_at >= ? ORDER BY created_at DESC")
      .get(elder.id, since);
    if (open) {
      db.prepare(`UPDATE emergencies SET presses = presses + 1, last_pressed_at = ?,
                  latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?) WHERE id = ?`)
        .run(now.toISOString(), latitude, longitude, open.id);
      return res.status(201).json({ emergencyId: open.id, caregiversTold: true, repeated: true });
    }

    const result = db.prepare("INSERT INTO emergencies (elder_id, latitude, longitude, created_at) VALUES (?, ?, ?, ?)")
      .run(elder.id, latitude, longitude, now.toISOString());

    const at = friendlyTime(localParts(now, elder.timezone).hhmm);
    const where = latitude === null ? "" : ` Location: https://maps.google.com/?q=${latitude},${longitude}`;
    const message = `EMERGENCY: ${elder.name} pressed the emergency button at ${at}. Call ${elder.name} now.${where}`;
    const told = messageCaregivers(db, { elder, kind: "emergency", message, everyChannel: true });

    res.status(201).json({ emergencyId: Number(result.lastInsertRowid), caregiversTold: told > 0 });
  });

  // POST /api/emergency/:id/ok — "I'm OK": it was a mistake, or help has come.
  router.post("/emergency/:id/ok", requireElderDevice, (req, res) => {
    const emergencyId = check.id(req.params.id, "emergency");
    const row = db.prepare("SELECT * FROM emergencies WHERE id = ?").get(emergencyId);
    if (!row || row.elder_id !== req.elderId) throw new HttpError(404, "That emergency doesn't exist.");
    if (!row.cancelled_at) {
      const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(req.elderId);
      const now = clock.now();
      db.prepare("UPDATE emergencies SET cancelled_at = ? WHERE id = ?").run(now.toISOString(), emergencyId);
      const at = friendlyTime(localParts(now, elder.timezone).hhmm);
      messageCaregivers(db, {
        elder, kind: "emergency-cancelled", everyChannel: true,
        message: `${elder.name} pressed "I'm OK" at ${at} after the emergency button. Please still call to check.`,
      });
    }
    res.status(204).end();
  });

  return router;
}
