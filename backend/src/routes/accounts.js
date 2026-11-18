// A. Caregiver accounts: sign up, sign in, sign out, "who am I?"

import { Router } from "express";
import { HttpError } from "../errors.js";
import { transaction } from "../db.js";
import { hashPassword, checkPassword, DUMMY_HASH, newToken, hashToken, requireCaregiver, expiryFor } from "../auth.js";
import { RULES } from "../config.js";
import { refuseIfTooMany, noteFailure, clearFailures, addressOf } from "../limiter.js";
import * as check from "../validate.js";

export function accountRoutes(db) {
  const router = Router();

  // Creates a signed-in device for a caregiver and returns its token.
  function signIn(caregiverId, platform) {
    const token = newToken();
    db.prepare("INSERT INTO devices (caregiver_id, token_hash, platform, expires_at) VALUES (?, ?, ?, ?)")
      .run(caregiverId, hashToken(token), platform, expiryFor(false));
    return token;
  }

  // POST /api/auth/signup
  router.post("/auth/signup", (req, res) => {
    const name = check.text(req.body?.name, "name", { max: 100 });
    const email = check.email(req.body?.email);
    const password = check.password(req.body?.password);
    const phone = check.phone(req.body?.phone, "phone number");
    const platform = check.oneOf(req.body?.platform ?? "web", ["web", "android", "ios"], "platform");

    const existing = db.prepare("SELECT id FROM caregivers WHERE email = ?").get(email);
    if (existing) throw new HttpError(409, "An account with that email already exists. Try signing in.");

    const { caregiverId, token } = transaction(db, () => {
      const result = db
        .prepare("INSERT INTO caregivers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)")
        .run(name, email, phone, hashPassword(password));
      const caregiverId = Number(result.lastInsertRowid);
      return { caregiverId, token: signIn(caregiverId, platform) };
    });

    res.status(201).json({ token, caregiver: { id: caregiverId, name, email, phone } });
  });

  // POST /api/auth/login
  router.post("/auth/login", (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const platform = check.oneOf(req.body?.platform ?? "web", ["web", "android", "ios"], "platform");

    // Wrong passwords are counted: for this email from this address, and for this address across all emails.
    const address = addressOf(req);
    const who = `${email}|${address}`;
    const wait = "Too many wrong tries. Wait 15 minutes, then try again.";
    refuseIfTooMany(db, "login", who, { max: RULES.LOGIN_TRIES, minutes: RULES.TRY_WINDOW_MINUTES, message: wait });
    refuseIfTooMany(db, "login-address", address, { max: RULES.LOGIN_TRIES_ADDRESS, minutes: RULES.TRY_WINDOW_MINUTES, message: wait });

    const caregiver = db.prepare("SELECT * FROM caregivers WHERE email = ?").get(email);
    const passwordOk = checkPassword(password, caregiver?.password_hash ?? DUMMY_HASH);
    // Same message whether the email or the password was wrong, so we don't reveal which emails exist.
    if (!caregiver || !passwordOk) {
      noteFailure(db, "login", who);
      noteFailure(db, "login-address", address);
      throw new HttpError(401, "Email or password is wrong.");
    }
    clearFailures(db, "login", who);

    const token = signIn(caregiver.id, platform);
    res.json({ token, caregiver: { id: caregiver.id, name: caregiver.name, email: caregiver.email, phone: caregiver.phone } });
  });

  // POST /api/auth/logout — forgets this device's token
  router.post("/auth/logout", requireCaregiver, (req, res) => {
    db.prepare("DELETE FROM devices WHERE id = ?").run(req.deviceId);
    res.status(204).end();
  });

  // POST /api/auth/logout-everywhere — signs out every phone and browser I'm signed in on, this one too
  router.post("/auth/logout-everywhere", requireCaregiver, (req, res) => {
    const { changes } = db.prepare("DELETE FROM devices WHERE caregiver_id = ?").run(req.caregiverId);
    res.json({ signedOut: Number(changes) });
  });

  // POST /api/auth/password  { currentPassword, newPassword } — change my password.
  // Every other phone and browser is signed out; this one stays signed in.
  router.post("/auth/password", requireCaregiver, (req, res) => {
    const me = db.prepare("SELECT id, email, password_hash FROM caregivers WHERE id = ?").get(req.caregiverId);
    // Wrong tries at the current password are counted like wrong sign-ins.
    const who = `${me.email}|${addressOf(req)}`;
    refuseIfTooMany(db, "login", who, {
      max: RULES.LOGIN_TRIES, minutes: RULES.TRY_WINDOW_MINUTES, message: "Too many wrong tries. Wait 15 minutes, then try again.",
    });
    if (!checkPassword(String(req.body?.currentPassword ?? ""), me.password_hash)) {
      noteFailure(db, "login", who);
      throw new HttpError(400, "Your current password is wrong.");
    }
    const newPassword = check.password(req.body?.newPassword);
    if (checkPassword(newPassword, me.password_hash)) throw new HttpError(400, "Choose a password different from your current one.");

    const signedOut = transaction(db, () => {
      db.prepare("UPDATE caregivers SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), me.id);
      return db.prepare("DELETE FROM devices WHERE caregiver_id = ? AND id != ?").run(me.id, req.deviceId).changes;
    });
    clearFailures(db, "login", who);
    res.json({ changed: true, signedOutOthers: Number(signedOut) });
  });

  // GET /api/me
  router.get("/me", requireCaregiver, (req, res) => {
    const me = db.prepare("SELECT id, name, email, phone FROM caregivers WHERE id = ?").get(req.caregiverId);
    const elders = db
      .prepare(`SELECT e.id, e.name, l.role FROM care_links l JOIN elders e ON e.id = l.elder_id
                WHERE l.caregiver_id = ? ORDER BY e.name`)
      .all(req.caregiverId);
    res.json({ ...me, elders });
  });

  return router;
}
