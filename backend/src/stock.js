// The medicine meter: about how many tablets are left, and for how many days.
//
// The family counts the tablets once ("30 left") and says how many make one dose.
// From then on, every scheduled dose time that passes takes that many away. We count by the
// schedule, not by taps, so a dose Kamala forgot to tap still counts. That's why the app always
// says "about": the family should recount now and then, and whenever they buy more.
// A dose Kamala marked "Skip" is the exception: she said she didn't take it, so it isn't counted.

import { RULES } from "./config.js";
import { localParts, toMinutes, addDays } from "./time.js";

function nextDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// How many dose times fall after the count and up to now, in the elder's own time.
// Example: counted at 9:00 on Monday with doses at 08:00 and 20:00; at 21:00 on Tuesday that's 3.
export function dosesSince(times, countedAtIso, now, timeZone) {
  const from = localParts(new Date(countedAtIso), timeZone);
  const to = localParts(now, timeZone);
  let count = 0;
  for (let date = from.date, days = 0; date <= to.date && days < 400; date = nextDate(date), days++) {
    for (const time of times) {
      const minutes = toMinutes(time);
      const afterCount = date > from.date || minutes > from.minutes;
      const notYetToCome = date < to.date || minutes <= to.minutes;
      if (afterCount && notYetToCome) count++;
    }
  }
  return count;
}

// How many days ahead to warn the family: the chemist's time to get it ready, plus spare days,
// plus more for a medicine that's hard to get. With the usual settings that's 2 + 3 = 5 days.
export function orderAheadDays(chemistLeadDays, hardToGet) {
  return (chemistLeadDays ?? RULES.CHEMIST_LEAD_DAYS) + RULES.SPARE_DAYS + (hardToGet ? RULES.HARD_TO_GET_DAYS : 0);
}

// The meter for one medicine, or null if the family hasn't counted its tablets.
// row: a medicines row; times: its active dose times ("08:00"); now: a Date.
// options.skipped: doses Kamala marked "Skip" since the count. She didn't take those, so they used no tablet.
// options.chemistLeadDays: from the elder's settings.
export function meter(row, times, timeZone, now, { skipped = 0, chemistLeadDays = RULES.CHEMIST_LEAD_DAYS } = {}) {
  if (row.stock_count === null || row.stock_count === undefined || !row.stock_counted_at || times.length === 0) return null;
  const used = Math.max(0, dosesSince(times, row.stock_counted_at, now, timeZone) - skipped) * row.per_dose;
  const tabletsLeft = Math.max(0, row.stock_count - used);
  const daysLeft = Math.floor(tabletsLeft / (times.length * row.per_dose));
  const ahead = orderAheadDays(chemistLeadDays, row.hard_to_get === 1);
  const today = localParts(now, timeZone).date;
  return {
    tabletsLeft: Math.round(tabletsLeft * 2) / 2, // to the nearest half tablet
    perDose: row.per_dose,
    countedAt: row.stock_counted_at,
    daysLeft,
    orderAheadDays: ahead,
    orderBy: addDays(today, Math.max(0, daysLeft - ahead)), // the last day to order without running short
    runOutOn: addDays(today, daysLeft),
    runningLow: daysLeft <= ahead,
  };
}

// The meter, with everything it needs looked up in the database.
export function meterFor(db, row, times, timeZone, now) {
  if (row.stock_count === null || row.stock_count === undefined) return null;
  const { skipped } = db
    .prepare(`SELECT COUNT(*) AS skipped FROM dose_log d JOIN schedules s ON s.id = d.schedule_id
              WHERE s.medicine_id = ? AND d.status = 'skipped' AND d.recorded_at > ?`)
    .get(row.id, row.stock_counted_at);
  const elder = db.prepare("SELECT chemist_lead_days FROM elders WHERE id = ?").get(row.elder_id);
  return meter(row, times, timeZone, now, { skipped, chemistLeadDays: elder?.chemist_lead_days });
}
