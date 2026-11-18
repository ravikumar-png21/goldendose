// Counting wrong tries ("rate limiting").
// A secret that can be guessed (a 6-digit code, a password) is only safe if wrong guesses are counted.
// Every wrong try is saved in the failed_attempts table with what it was for ("pair", "login") and
// who made it (a network address, or an email plus address). Once there are too many in a short
// time, that caller is refused with reply 429 ("too many requests") until the old tries age out.
//
// The counts live in the database, not in memory, so they survive a restart.

import { HttpError } from "./errors.js";
import { clock } from "./clock.js";

const minutesAgo = (minutes) => new Date(clock.now().getTime() - minutes * 60_000).toISOString();

// How many wrong tries of this kind this caller has made in the last few minutes.
// who = null counts everyone together (the server-wide cap).
export function failuresSince(db, kind, who, minutes) {
  const since = minutesAgo(minutes);
  const row = who === null
    ? db.prepare("SELECT COUNT(*) AS n FROM failed_attempts WHERE kind = ? AND at >= ?").get(kind, since)
    : db.prepare("SELECT COUNT(*) AS n FROM failed_attempts WHERE kind = ? AND who = ? AND at >= ?").get(kind, who, since);
  return row.n;
}

// Refuses the request if this caller has already used up their tries.
export function refuseIfTooMany(db, kind, who, { max, minutes, message }) {
  if (failuresSince(db, kind, who, minutes) >= max) throw new HttpError(429, message);
}

// Remembers one wrong try. Also clears out tries older than a day, so the table stays small.
export function noteFailure(db, kind, who) {
  db.prepare("INSERT INTO failed_attempts (kind, who, at) VALUES (?, ?, ?)").run(kind, who, clock.now().toISOString());
  db.prepare("DELETE FROM failed_attempts WHERE at < ?").run(minutesAgo(24 * 60));
}

// After a correct try, the caller starts again from zero.
export function clearFailures(db, kind, who) {
  db.prepare("DELETE FROM failed_attempts WHERE kind = ? AND who = ?").run(kind, who);
}

// The caller's network address. Behind a hosting service, set TRUST_PROXY=1 so this is the
// real visitor's address and not the hosting service's own (see app.js).
export function addressOf(req) {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}
