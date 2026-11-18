// Small helpers both apps use.

// Makes text safe to put inside HTML.
// Without this, a medicine named "<script>…" could run code on someone's phone.
// This attack is called cross-site scripting (XSS). Every name typed by a person goes through esc().
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// "09:30" → 570 minutes since midnight
export function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// "21:30" → "9:30 pm"
export function friendlyTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

// A moment in time as a date and clock time in a given timezone (same as backend/src/time.js)
export function localParts(moment, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(moment);
  const get = (type) => parts.find((p) => p.type === type).value;
  const hhmm = `${get("hour")}:${get("minute")}`;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hhmm, minutes: toMinutes(hhmm) };
}

// A drawing of the pill, used when there's no photo.
export function pillSVG({ pillShape = "round", pillColor = "#FFFFFF", pillColor2 = null } = {}, size = 56) {
  const outline = "#3A3A36";
  const c1 = esc(pillColor);
  const c2 = esc(pillColor2 || "#FFFFFF");
  const open = `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">`;
  if (pillShape === "oval") {
    return `${open}<ellipse cx="32" cy="32" rx="26" ry="15" transform="rotate(-25 32 32)" fill="${c1}" stroke="${outline}" stroke-width="2.5"/></svg>`;
  }
  if (pillShape === "capsule") {
    return `${open}<g transform="rotate(-35 32 32)">
      <path d="M32 21 H19 a11 11 0 0 0 0 22 H32 Z" fill="${c1}" stroke="${outline}" stroke-width="2.5"/>
      <path d="M32 21 H45 a11 11 0 0 1 0 22 H32 Z" fill="${c2}" stroke="${outline}" stroke-width="2.5"/></g></svg>`;
  }
  return `${open}<circle cx="32" cy="32" r="24" fill="${c1}" stroke="${outline}" stroke-width="2.5"/>
    <line x1="16" y1="32" x2="48" y2="32" stroke="${outline}" stroke-width="2" opacity="0.45"/></svg>`;
}

// The photo if there is one, otherwise the drawing.
export function pillPicture(medicine, size = 56) {
  if (medicine.photoUrl) {
    return `<img src="${esc(medicine.photoUrl)}" alt="Photo of ${esc(medicine.name)}" width="${size}" height="${size}" class="pill-img">`;
  }
  return pillSVG(medicine, size);
}
