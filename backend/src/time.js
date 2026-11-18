// Time helpers.
// "9:00 am" must mean 9:00 where Kamala lives, even if the server is in another country.
// Every elder has a timezone (for example "Asia/Kolkata"), and we convert using it.

// Turns a moment in time into the elder's local date and clock time.
// Example: localParts(new Date(), "Asia/Kolkata") → { date: "2026-10-12", hhmm: "09:02", minutes: 542 }
export function localParts(moment, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(moment);
  const get = (type) => parts.find((p) => p.type === type).value;
  const hhmm = `${get("hour")}:${get("minute")}`;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hhmm, minutes: toMinutes(hhmm) };
}

// "09:30" → 570 (minutes since midnight). Makes comparing times simple arithmetic.
export function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// "21:30" → "9:30 pm", for messages people read.
export function friendlyTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// "2026-10-12" plus 1 day → "2026-10-13" (and minus: addDays(date, -1) is the day before).
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The exact moment when the clock on the elder's wall shows this date and time.
// Example: localToMoment("2026-10-12", "23:40", "Asia/Kolkata") → 2026-10-12T18:10:00Z.
// Working with full moments (not "minutes since midnight") is what makes rules like
// "30 minutes late" still work when they cross midnight.
export function localToMoment(date, hhmm, timeZone) {
  const wanted = Date.parse(`${date}T${hhmm}:00Z`); // the wall-clock reading, as if it were UTC
  let guess = wanted;
  for (let i = 0; i < 2; i++) {                      // twice, in case the first guess lands across a clock change
    const shown = localParts(new Date(guess), timeZone);
    guess += wanted - Date.parse(`${shown.date}T${shown.hhmm}:00Z`);
  }
  return new Date(guess);
}

// "", "yesterday" or "on Mon 12 Oct": how to name a dose's day in a message sent on a later day.
export function dayWords(date, today) {
  if (date === today) return "";
  if (date === addDays(today, -1)) return " yesterday";
  return ` on ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`;
}
