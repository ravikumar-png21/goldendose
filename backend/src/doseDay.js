// Which day does a dose belong to?
//
// Usually today. But a dose due late in the evening is still "open" after midnight: Kamala may tap
// Taken at 12:10 am for her 11:40 pm tablet, and the missed-dose check must still notice it at 12:10 am.
// So every rule here works with the dose's full due moment (date + time), never with "minutes since midnight".

import { RULES } from "./config.js";
import { localParts, localToMoment, toMinutes, addDays } from "./time.js";

// The moment a dose time started to count: when its time was (last) switched on, or when its
// medicine was (last) started again, whichever is later. Doses due before this never existed.
export function countsFrom(schedule) {
  const since = schedule.active_since ?? schedule.created_at;
  return new Date(schedule.restarted_at && schedule.restarted_at > since ? schedule.restarted_at : since);
}

// For a tap (or the Today list) at this moment: the date of the dose in question.
// Returns { date, carriedOver }. carriedOver = true means "yesterday's dose, still open".
// schedule needs: id, time_of_day, created_at, active_since, restarted_at.
export function doseDayFor(db, schedule, now, timeZone) {
  const local = localParts(now, timeZone);
  const minutesUntilToday = toMinutes(schedule.time_of_day) - local.minutes;
  // Today's dose is due, or due soon: that's the one.
  if (minutesUntilToday <= RULES.EARLY_MINUTES) return { date: local.date, carriedOver: false };

  // Today's is still far off. Is yesterday's still open (not marked, and not too long ago)?
  const yesterday = addDays(local.date, -1);
  const due = localToMoment(yesterday, schedule.time_of_day, timeZone);
  const stillInTime = now - due <= RULES.LATE_TAP_HOURS * 3_600_000;
  if (stillInTime && due >= countsFrom(schedule)) {
    const record = db.prepare("SELECT status FROM dose_log WHERE schedule_id = ? AND date = ?").get(schedule.id, yesterday);
    if (!record || record.status === "missed") return { date: yesterday, carriedOver: true };
  }
  return { date: local.date, carriedOver: false };
}
