// The missed-dose check: a "background job" that runs every minute on its own.
// It finds doses that are 30+ minutes late with nothing recorded, saves them as "missed",
// and tells every caregiver linked to that elder.
//
// It looks back 48 hours every time, not just at today. That is what makes two things work:
//   - a dose due at 11:40 pm becomes late at 12:10 am, which is already "tomorrow";
//   - if the server was off for a while, the doses that became late meanwhile are still found.
// The database allows only one record per dose per day, so looking twice never counts or alerts twice.

import { clock } from "../clock.js";
import { RULES } from "../config.js";
import { localParts, localToMoment, addDays, dayWords } from "../time.js";
import { countsFrom } from "../doseDay.js";
import { alertCaregiversAboutMissedDose } from "../notify.js";
import { checkRunningLow } from "./runningLow.js";
import { checkPatterns } from "../insights.js";
import { checkHealth } from "../health.js";
import { messageCaregivers } from "../notify.js";

export function checkMissedDoses(db) {
  const now = clock.now();
  const lookBackFrom = new Date(now.getTime() - RULES.MISSED_LOOK_BACK_HOURS * 3_600_000);
  const elders = db.prepare("SELECT id, name, timezone FROM elders").all();
  const activeTimes = db.prepare(`
    SELECT s.id, s.time_of_day, s.created_at, s.active_since, m.restarted_at, m.name
    FROM schedules s JOIN medicines m ON m.id = s.medicine_id
    WHERE m.elder_id = ? AND m.active = 1 AND s.active = 1`);
  const recorded = db.prepare("SELECT 1 FROM dose_log WHERE schedule_id = ? AND date = ?");
  const saveMissed = db.prepare(
    "INSERT INTO dose_log (schedule_id, date, status, recorded_at, recorded_by) VALUES (?, ?, 'missed', ?, 'system')"
  );

  let found = 0;
  for (const elder of elders) {
    const today = localParts(now, elder.timezone).date; // the elder's own date
    // Every date a late dose could belong to: from the day the look-back starts, up to today.
    const dates = [];
    for (let date = localParts(lookBackFrom, elder.timezone).date; date <= today; date = addDays(date, 1)) dates.push(date);

    for (const dose of activeTimes.all(elder.id)) {
      const from = countsFrom(dose);
      for (const date of dates) {
        // The dose's full due moment. "30 minutes late" is then simple arithmetic, even across midnight.
        const due = localToMoment(date, dose.time_of_day, elder.timezone);
        const lateAt = new Date(due.getTime() + RULES.MISSED_AFTER_MINUTES * 60_000);
        if (lateAt > now) continue;           // not late enough yet
        if (lateAt <= lookBackFrom) continue; // too long ago to tell the family about now
        // A medicine added at 3 pm with an 8 am time wasn't "missed" today. It didn't exist yet.
        // The same goes for a time, or a medicine, that was switched off and on again.
        if (due < from) continue;
        if (recorded.get(dose.id, date)) continue; // taken, skipped, or already marked missed

        const result = saveMissed.run(dose.id, date, now.toISOString());
        alertCaregiversAboutMissedDose(db, {
          doseLogId: Number(result.lastInsertRowid),
          elder,
          medicineName: dose.name,
          timeOfDay: dose.time_of_day,
          day: dayWords(date, today),
        });
        found++;
      }
    }
  }
  return found;
}

export function startMissedDoseJob(db) {
  let minutes = 0;
  const run = () => {
    try {
      const found = checkMissedDoses(db);
      if (found > 0 && process.env.QUIET !== "1") console.log(`Missed-dose check: ${found} missed dose(s) found.`);
      const low = checkRunningLow(db); // the same minute, check for medicines running low
      if (low > 0 && process.env.QUIET !== "1") console.log(`Running-low check: ${low} medicine(s) running low.`);
      if (minutes++ % 60 === 0) { // once an hour: look for patterns worth telling the family
        const told = checkPatterns(db, messageCaregivers);
        if (told > 0 && process.env.QUIET !== "1") console.log(`Pattern check: ${told} new pattern(s) told to families.`);
        const nudged = checkHealth(db, messageCaregivers); // blood reports, tests due, BP checks, doctor visits
        if (nudged > 0 && process.env.QUIET !== "1") console.log(`Health check: ${nudged} reminder(s) sent to families.`);
      }
    } catch (error) {
      console.error("Missed-dose check failed:", error);
    }
  };
  run();
  return setInterval(run, 60_000);
}
