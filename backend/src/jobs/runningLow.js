// The "running low" check: runs with the missed-dose check, every minute.
// When a counted medicine is down to its "order ahead" days (usually 5: see stock.js), every caregiver is told, their way,
// once. Counting again (after buying more) starts a fresh meter, so they'll be told again next time.

import { clock } from "../clock.js";
import { meterFor } from "../stock.js";
import { messageCaregivers } from "../notify.js";

export function checkRunningLow(db) {
  const now = clock.now();
  const rows = db
    .prepare(`SELECT m.*, e.name AS elder_name, e.timezone, e.id AS elder_key
              FROM medicines m JOIN elders e ON e.id = m.elder_id
              WHERE m.active = 1 AND m.stock_count IS NOT NULL AND m.stock_alerted_at IS NULL`)
    .all();
  const timesOf = db.prepare("SELECT time_of_day FROM schedules WHERE medicine_id = ? AND active = 1");

  let told = 0;
  for (const row of rows) {
    const times = timesOf.all(row.id).map((s) => s.time_of_day);
    const m = meterFor(db, row, times, row.timezone, now);
    if (!m || !m.runningLow) continue;

    const name = `${row.name}${row.strength ? ` ${row.strength}` : ""}`;
    const days = m.daysLeft === 0 ? "has run out or will today" : `may run out in about ${m.daysLeft} day${m.daysLeft === 1 ? "" : "s"}`;
    messageCaregivers(db, {
      elder: { id: row.elder_key, name: row.elder_name },
      kind: "running-low",
      message: `${row.elder_name}'s ${name} ${days} (about ${m.tabletsLeft} tablets left). Time to buy more.`,
    });
    db.prepare("UPDATE medicines SET stock_alerted_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    told++;
  }
  return told;
}
