// Security: passwords, tokens, and "who is calling?"

import { scryptSync, randomBytes, timingSafeEqual, createHash, randomInt } from "node:crypto";
import { HttpError } from "./errors.js";
import { clock } from "./clock.js";
import { RULES } from "./config.js";

// ---------- Passwords ----------
// We never store a password. We store a one-way scramble ("hash") of it, mixed with a
// random "salt" so two people with the same password get different scrambles.

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function checkPassword(password, stored) {
  const [, saltHex, keyHex] = stored.split("$");
  const key = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return timingSafeEqual(key, Buffer.from(keyHex, "hex"));
}

// Used when an email isn't found, so a wrong email takes as long as a wrong password.
// Otherwise someone could time the replies to discover which emails have accounts.
export const DUMMY_HASH = hashPassword("not-a-real-password");

// ---------- Tokens ----------
// After signing in (or pairing), the phone gets a long random token, like a wristband.
// It sends the token with every request. We store only a scramble of it.

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function newPairingCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0"); // "048213"
}

// ---------- Who is calling? ----------
// Runs before every request. Reads the "Authorization: Bearer <token>" header and,
// if the token is valid, notes who it belongs to: a caregiver or an elder's phone.

// When a token given (or used) now stops working: 30 days for a family member, a year for the elder's phone.
export function expiryFor(isElderPhone) {
  // The usual lengths are in config.js. SIGN_IN_DAYS / PHONE_SIGN_IN_DAYS in the environment override them
  // (read here, each time, so a test that jumps months ahead can ask for a longer sign-in).
  const days = isElderPhone
    ? Number(process.env.PHONE_SIGN_IN_DAYS ?? RULES.PHONE_SIGN_IN_DAYS)
    : Number(process.env.SIGN_IN_DAYS ?? RULES.SIGN_IN_DAYS);
  return new Date(clock.now().getTime() + days * 86_400_000).toISOString();
}

export function identifyCaller(db) {
  const findDevice = db.prepare("SELECT id, elder_id, caregiver_id, expires_at FROM devices WHERE token_hash = ?");
  const touchDevice = db.prepare("UPDATE devices SET last_seen = ?, expires_at = ? WHERE id = ?");
  const forgetDevice = db.prepare("DELETE FROM devices WHERE id = ?");

  return (req, res, next) => {
    const header = req.get("Authorization") ?? "";
    const match = header.match(/^Bearer (.+)$/);
    if (match) {
      const device = findDevice.get(hashToken(match[1]));
      const now = clock.now().toISOString();
      if (device && device.expires_at && device.expires_at < now) {
        forgetDevice.run(device.id); // not used for too long: the token no longer works (the caller must sign in again)
      } else if (device) {
        req.deviceId = device.id;
        req.caregiverId = device.caregiver_id ?? null;
        req.elderId = device.elder_id ?? null;
        // Each use moves the end date forward, so people who use the app stay signed in.
        touchDevice.run(now, expiryFor(Boolean(device.elder_id)), device.id);
      }
    }
    next();
  };
}

export function requireCaregiver(req, res, next) {
  if (!req.caregiverId) return next(new HttpError(401, "Sign in first."));
  next();
}

export function requireElderDevice(req, res, next) {
  if (!req.elderId) return next(new HttpError(401, "This phone isn't paired yet."));
  next();
}

export function requireAnyCaller(req, res, next) {
  if (!req.deviceId) return next(new HttpError(401, "Sign in first."));
  next();
}

// Checks that a caregiver looks after this elder. Returns their care link (with their role).
export function careLinkOrFail(db, caregiverId, elderId) {
  const elder = db.prepare("SELECT id FROM elders WHERE id = ?").get(elderId);
  if (!elder) throw new HttpError(404, "That person doesn't exist.");
  const link = db
    .prepare("SELECT * FROM care_links WHERE caregiver_id = ? AND elder_id = ?")
    .get(caregiverId, elderId);
  if (!link) throw new HttpError(403, "You don't look after this person.");
  return link;
}
