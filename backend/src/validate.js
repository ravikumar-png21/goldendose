// Input checks ("validation"). The backend never trusts what it receives.
// Each helper either returns a cleaned-up value or throws a 400 error with a plain message.

import { HttpError } from "./errors.js";

export function text(value, label, { max = 200, required = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (required) throw new HttpError(400, `Enter the ${label}.`);
    return "";
  }
  if (typeof value !== "string") throw new HttpError(400, `The ${label} must be text.`);
  const cleaned = value.trim();
  if (cleaned.length > max) throw new HttpError(400, `The ${label} is too long (${max} characters at most).`);
  return cleaned;
}

export function email(value) {
  const cleaned = text(value, "email address", { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw new HttpError(400, "That email address doesn't look right.");
  return cleaned;
}

// Passwords that are tried first by anyone guessing. Refused even though they are long enough.
const COMMON_PASSWORDS = new Set([
  "1234567890", "0123456789", "0987654321", "1234567891", "12345678910", "123456789a", "1q2w3e4r5t", "qwertyuiop",
  "qwerty12345", "qwerty123456", "password12", "password123", "password1234", "passwordpassword", "iloveyou123",
  "abcdefghij", "abcd123456", "abc1234567", "aaaaaaaaaa", "1111111111", "0000000000", "india12345", "welcome123",
  "admin12345", "letmein123", "goldendose", "goldendose1", "goldendose123",
]);

export function password(value) {
  if (typeof value !== "string" || value.length < 10) {
    throw new HttpError(400, "Choose a password of at least 10 characters.");
  }
  if (value.length > 200) throw new HttpError(400, "That password is too long (200 characters at most).");
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    throw new HttpError(400, "That password is too easy to guess. Choose a different one.");
  }
  return value;
}

export function timeOfDay(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new HttpError(400, `"${value}" isn't a valid time. Use 24-hour format, like 08:00 or 20:30.`);
  }
  return value;
}

export function times(value) {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, "Add at least one time for this medicine.");
  if (value.length > 12) throw new HttpError(400, "A medicine can have at most 12 times a day.");
  const cleaned = [...new Set(value.map(timeOfDay))];
  return cleaned.sort();
}

export function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new HttpError(400, `The ${label} must be one of: ${allowed.join(", ")}.`);
  return value;
}

export function color(value, label) {
  if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new HttpError(400, `The ${label} must be a colour code like #F4A7B9.`);
  }
  return value.toUpperCase();
}

export function boolean(value, label) {
  if (typeof value !== "boolean") throw new HttpError(400, `The ${label} setting must be true or false.`);
  return value;
}

export function id(value, label = "id") {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, `That ${label} isn't valid.`);
  return number;
}

export function date(value, label) {
  const looksRight = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  // "2026-02-30" looks right but doesn't exist. JavaScript quietly turns it into 2 March,
  // so we turn it back into text and check it's still what was typed.
  const real = looksRight ? new Date(`${value}T00:00:00Z`) : null;
  if (!real || Number.isNaN(real.getTime()) || real.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `The ${label} date must be a real date that looks like 2026-10-12.`);
  }
  return value;
}

// A moment in time, such as when a reading was taken: "2026-10-12T08:30:00+05:30" or "2026-10-12T03:00:00Z".
// It must be a full date and time, not in the future (a minute's slack for clocks), and not older than maxYears.
export function moment(value, label, now, { maxYears = 5 } = {}) {
  const full = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value);
  const when = full ? new Date(value) : null;
  if (!when || Number.isNaN(when.getTime())) throw new HttpError(400, `Choose when the ${label} was taken, as a date and time.`);
  if (when.getTime() > now.getTime() + 60_000) throw new HttpError(400, `Choose when the ${label} was taken: now or earlier.`);
  if (when.getTime() < now.getTime() - maxYears * 365 * 86_400_000) throw new HttpError(400, `That ${label} is more than ${maxYears} years old.`);
  return when;
}

export function number(value, label, { min = 0, max = 100000 } = {}) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new HttpError(400, `The ${label} must be a number.`);
  if (n < min || n > max) throw new HttpError(400, `The ${label} must be between ${min} and ${max}.`);
  return n;
}

// Indian and international phone numbers: digits, with an optional + and spaces or dashes. "108" is fine too.
export function phone(value, label) {
  const cleaned = text(value, label, { max: 20, required: false });
  if (cleaned === "") return null;
  if (!/^\+?[0-9][0-9 -]{1,18}$/.test(cleaned)) throw new HttpError(400, `The ${label} should be digits only, like +91 98765 43210.`);
  return cleaned;
}
