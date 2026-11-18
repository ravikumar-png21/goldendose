// The change history ("audit trail"): who changed what, when, and why.
// Every change the family makes to an elder's medicines or settings is saved here, in plain words,
// so brothers and sisters sharing the care can always see "Arjun changed Metformin: 8:00 am → 9:00 am".

import { clock } from "./clock.js";
import { friendlyTime } from "./time.js";

// The parts of a medicine worth remembering in its history.
export function medicineSnapshot(db, medicineId) {
  const row = db.prepare("SELECT * FROM medicines WHERE id = ?").get(medicineId);
  const times = db
    .prepare("SELECT time_of_day FROM schedules WHERE medicine_id = ? AND active = 1 ORDER BY time_of_day")
    .all(medicineId)
    .map((s) => s.time_of_day);
  return {
    id: row.id, name: row.name, strength: row.strength, instruction: row.instruction, purpose: row.purpose,
    times, active: row.active === 1, hardToGet: row.hard_to_get === 1,
    // How the pill looks. Kamala picks her tablet by its picture, so these count as changes too.
    pillShape: row.pill_shape, pillColor: row.pill_color, pillColor2: row.pill_color2 ?? null,
  };
}

const label = (m) => `${m.name}${m.strength ? ` ${m.strength}` : ""}`;
const timesText = (times) => times.map(friendlyTime).join(", ") || "no times";

// "times 8:00 am → 9:00 am; strength 500 mg → 1000 mg"
export function describeDifference(before, after) {
  const parts = [];
  const was = (field, name, show = (v) => v || "(empty)") => {
    if (before[field] !== after[field]) parts.push(`${name} ${show(before[field])} → ${show(after[field])}`);
  };
  was("name", "name");
  was("strength", "strength");
  if (before.times.join() !== after.times.join()) parts.push(`times ${timesText(before.times)} → ${timesText(after.times)}`);
  was("instruction", "instruction");
  was("purpose", "what it's for");
  was("pillShape", "pill shape");
  if (before.pillColor !== after.pillColor || (before.pillColor2 ?? null) !== (after.pillColor2 ?? null)) {
    const colours = (m) => [m.pillColor, m.pillColor2].filter(Boolean).join(" and ");
    parts.push(`pill colour ${colours(before)} → ${colours(after)}`);
  }
  if (before.hardToGet !== after.hardToGet) parts.push(after.hardToGet ? "marked hard to get" : "no longer marked hard to get");
  if (before.active !== after.active && after.active) parts.push("started again");
  return parts.join("; ");
}

export function describeNewMedicine(m) {
  return `${label(m)} at ${timesText(m.times)}${m.purpose ? ` (for ${m.purpose})` : ""}`;
}

export function recordChange(db, { elderId, caregiverId, medicineId = null, action, summary, reason = "", after = null }) {
  db.prepare(`INSERT INTO changes (elder_id, caregiver_id, medicine_id, action, summary, reason, after, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(elderId, caregiverId, medicineId, action, summary, reason, after ? JSON.stringify(after) : null, clock.now().toISOString());
}

export function medicineLabel(m) {
  return label(m);
}
