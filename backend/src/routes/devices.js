// C. Pairing the elder's phone. Kamala never types a password:
// Priya makes a 6-digit code, it's typed once on Kamala's phone, and that phone is remembered.

import { Router } from "express";
import { HttpError } from "../errors.js";
import { clock } from "../clock.js";
import { RULES } from "../config.js";
import { newToken, hashToken, requireAnyCaller, expiryFor } from "../auth.js";
import { refuseIfTooMany, noteFailure, addressOf } from "../limiter.js";
import * as check from "../validate.js";

export function deviceRoutes(db) {
  const router = Router();

  // POST /api/devices/pair
  router.post("/devices/pair", (req, res) => {
    // A 6-digit code can be guessed, so wrong tries are counted: per network address, and for everyone together.
    const address = addressOf(req);
    const wait = "Too many tries. Wait a few minutes, then ask for a new code.";
    refuseIfTooMany(db, "pair", address, { max: RULES.PAIR_TRIES, minutes: RULES.TRY_WINDOW_MINUTES, message: wait });
    refuseIfTooMany(db, "pair", null, { max: RULES.PAIR_TRIES_EVERYONE, minutes: RULES.PAIR_EVERYONE_MINUTES, message: wait });

    const code = String(req.body?.code ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the 6-digit code.");
    const platform = check.oneOf(req.body?.platform ?? "web", ["web", "android", "ios"], "platform");

    const elder = db.prepare("SELECT id, name, pairing_code_expires_at FROM elders WHERE pairing_code = ?").get(code);
    if (!elder || elder.pairing_code_expires_at < clock.now().toISOString()) {
      noteFailure(db, "pair", address);
      throw new HttpError(400, "That code didn't work. It may have expired. Ask for a new one.");
    }

    const token = newToken();
    db.prepare("INSERT INTO devices (elder_id, token_hash, platform, expires_at) VALUES (?, ?, ?, ?)")
      .run(elder.id, hashToken(token), platform, expiryFor(true));
    // Each code works once.
    db.prepare("UPDATE elders SET pairing_code = NULL, pairing_code_expires_at = NULL WHERE id = ?").run(elder.id);

    res.status(201).json({ deviceToken: token, elder: { id: elder.id, name: elder.name } });
  });

  // PUT /api/devices/me — the phone tells us its push-notification address
  router.put("/devices/me", requireAnyCaller, (req, res) => {
    const pushToken = check.text(req.body?.pushToken, "push token", { max: 4096 });
    db.prepare("UPDATE devices SET push_token = ? WHERE id = ?").run(pushToken, req.deviceId);
    res.status(204).end();
  });

  // DELETE /api/devices/me — this phone disconnects itself (its token stops working)
  router.delete("/devices/me", requireAnyCaller, (req, res) => {
    db.prepare("DELETE FROM devices WHERE id = ?").run(req.deviceId);
    res.status(204).end();
  });

  return router;
}
