// Health records: blood reports, how often each test should be repeated, home blood pressure, and the next
// doctor visit, with the nudges GoldenDose gives the family about them.
//
// GoldenDose never interprets a result. It only says what the records show:
//   - "outside the range printed on the report" (the lab's own range, never one of ours)
//   - "has gone up in each of the last 3 reports"
//   - "the doctor asked for a repeat every 3 months, and it's due"
//   - "above the BP target the doctor gave"
// and every nudge points to the doctor.

import { clock } from "./clock.js";
import { localParts, addDays } from "./time.js";
import { flagFor } from "./health-tests.js";

const DAY = 86_400_000;
const addMonths = (date, months) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const niceDate = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
const rangeText = (r) =>
  r.range_low !== null && r.range_high !== null ? `${num(r.range_low)}–${num(r.range_high)}`
    : r.range_high !== null ? `up to ${num(r.range_high)}` : r.range_low !== null ? `at least ${num(r.range_low)}` : "";

export function resultJSON(r) {
  return {
    id: r.id, testKey: r.test_key, testName: r.test_name, value: r.value, unit: r.unit,
    rangeLow: r.range_low, rangeHigh: r.range_high, range: rangeText(r), flag: flagFor(r.value, r.range_low, r.range_high),
  };
}

export function reportJSON(db, report) {
  const results = db.prepare("SELECT * FROM lab_results WHERE report_id = ? ORDER BY id").all(report.id).map(resultJSON);
  return {
    id: report.id, elderId: report.elder_id, reportDate: report.report_date, lab: report.lab, note: report.note,
    hasFile: Boolean(report.file_name), kind: report.kind, fileUrl: report.file_name ? `/api/lab-reports/${report.id}/file` : null,
    doctorSeenAt: report.doctor_seen_at, doctorSeenBy: report.seen_by_name ?? null, addedBy: report.added_by_name ?? null,
    createdAt: report.created_at, results,
    outsideRange: results.filter((r) => r.flag === "high" || r.flag === "low").length,
  };
}

// Everything about one person's health records, for their Health page and for Ask.
export function healthSummary(db, elderId, now = clock.now()) {
  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId);
  const today = localParts(now, elder.timezone).date;
  const reports = db
    .prepare(`SELECT r.*, s.name AS seen_by_name, a.name AS added_by_name FROM lab_reports r
              LEFT JOIN caregivers s ON s.id = r.doctor_seen_by LEFT JOIN caregivers a ON a.id = r.added_by
              WHERE r.elder_id = ? ORDER BY r.report_date DESC, r.id DESC`)
    .all(elderId)
    .map((r) => reportJSON(db, r));

  // Each test, oldest result first
  const rows = db
    .prepare(`SELECT x.*, r.report_date FROM lab_results x JOIN lab_reports r ON r.id = x.report_id
              WHERE x.elder_id = ? ORDER BY r.report_date, x.id`)
    .all(elderId);
  const followups = db.prepare("SELECT * FROM test_followups WHERE elder_id = ?").all(elderId);
  const byKey = new Map();
  for (const row of rows) {
    const entry = byKey.get(row.test_key) ?? { testKey: row.test_key, testName: row.test_name, unit: row.unit, series: [] };
    entry.series.push({ date: row.report_date, value: row.value, flag: flagFor(row.value, row.range_low, row.range_high), range: rangeText(row), reportId: row.report_id });
    entry.unit = row.unit || entry.unit;
    byKey.set(row.test_key, entry);
  }
  for (const f of followups) {
    if (!byKey.has(f.test_key)) byKey.set(f.test_key, { testKey: f.test_key, testName: f.test_name, unit: "", series: [] });
  }
  const tests = [...byKey.values()].map((t) => {
    const latest = t.series.at(-1) ?? null;
    const last3 = t.series.slice(-3).map((s) => s.value);
    const trend = last3.length === 3 && last3[0] < last3[1] && last3[1] < last3[2] ? "up"
      : last3.length === 3 && last3[0] > last3[1] && last3[1] > last3[2] ? "down" : null;
    const followup = followups.find((f) => f.test_key === t.testKey);
    const nextDue = followup && latest ? addMonths(latest.date, followup.repeat_months) : null;
    const dueStatus = !nextDue ? null : nextDue < today ? "overdue" : daysBetween(today, nextDue) <= 7 ? "due soon" : "later";
    return { ...t, latest, trend, repeatMonths: followup?.repeat_months ?? null, nextDue, dueStatus };
  }).sort((a, b) => a.testName.localeCompare(b.testName));

  const readings = db
    .prepare(`SELECT b.*, c.name AS by_name FROM bp_readings b LEFT JOIN caregivers c ON c.id = b.recorded_by
              WHERE b.elder_id = ? ORDER BY b.taken_at DESC LIMIT 60`)
    .all(elderId)
    .map((b) => ({
      id: b.id, systolic: b.systolic, diastolic: b.diastolic, pulse: b.pulse, takenAt: b.taken_at, note: b.note, recordedBy: b.by_name,
      aboveTarget: elder.bp_target_sys !== null && (b.systolic > elder.bp_target_sys || (elder.bp_target_dia !== null && b.diastolic > elder.bp_target_dia)),
    }));
  const takesBpMedicine = db
    .prepare("SELECT 1 FROM medicines WHERE elder_id = ? AND active = 1 AND purpose LIKE '%blood pressure%'")
    .get(elderId) !== undefined;

  const readingsOf = (kind) => db
    .prepare(`SELECT h.*, c.name AS by_name FROM health_readings h LEFT JOIN caregivers c ON c.id = h.recorded_by
              WHERE h.elder_id = ? AND h.kind = ? ORDER BY h.taken_at DESC LIMIT 60`)
    .all(elderId, kind)
    .map((h) => ({ id: h.id, value: h.value, context: h.context, takenAt: h.taken_at, note: h.note, recordedBy: h.by_name }));
  const takesSugarMedicine = db
    .prepare("SELECT 1 FROM medicines WHERE elder_id = ? AND active = 1 AND (purpose LIKE '%diabet%' OR purpose LIKE '%sugar%')")
    .get(elderId) !== undefined;
  const questions = db
    .prepare(`SELECT q.*, c.name AS by_name FROM doctor_questions q LEFT JOIN caregivers c ON c.id = q.added_by
              WHERE q.elder_id = ? ORDER BY q.answered_at IS NOT NULL, q.created_at DESC LIMIT 60`)
    .all(elderId)
    .map((q) => ({ id: q.id, text: q.text, addedBy: q.by_name, createdAt: q.created_at, answeredAt: q.answered_at, answer: q.answer }));

  return {
    today,
    reports,
    tests,
    lab: elder.lab_phone || elder.lab_name ? { name: elder.lab_name ?? "", phone: elder.lab_phone ?? "" } : null,
    weight: { checkEveryDays: elder.weight_check_days, readings: readingsOf("weight") },
    sugar: { checkEveryDays: elder.sugar_check_days, readings: readingsOf("sugar"), takesSugarMedicine },
    questions,
    bp: {
      checkEveryDays: elder.bp_check_days, target: elder.bp_target_sys ? { systolic: elder.bp_target_sys, diastolic: elder.bp_target_dia } : null,
      readings, takesBpMedicine,
    },
    nextVisit: elder.next_visit_on ? { on: elder.next_visit_on, note: elder.next_visit_note } : null,
    note: "GoldenDose doesn't interpret results. It shows what the reports say and reminds you to show them to the doctor.",
  };
}

// The nudges for one person, most serious first within the caller's list. Each has a key, so it's sent at most once.
// messageable: also sent to the family by SMS/WhatsApp/app (the rest only appear in "Needs attention").
export function healthNudgesFor(db, elder, now = clock.now()) {
  const s = healthSummary(db, elder.id, now);
  const name = elder.name;
  const base = `#/elder/${elder.id}/health`;
  const nudges = [];
  const add = (n) => nudges.push({ link: base, messageable: true, ...n });

  // 1. A report with results outside the printed range that the doctor hasn't seen yet
  for (const r of s.reports) {
    const outside = r.results.filter((x) => x.flag === "high" || x.flag === "low");
    if (!outside.length || r.doctorSeenAt) continue;
    const recent = daysBetween(r.reportDate, s.today) <= 60;
    add({
      key: `report-${r.id}`, severity: recent ? "high" : "medium",
      title: `${name}'s blood report (${niceDate(r.reportDate)}): ${outside.length} result${outside.length === 1 ? "" : "s"} outside the printed range`,
      detail: `${outside.slice(0, 3).map((x) => `${x.testName} ${num(x.value)}${x.unit ? ` ${x.unit}` : ""} (range ${x.range})`).join("; ")}. Has ${name}'s doctor seen it?`,
      message: `${name}'s blood report from ${niceDate(r.reportDate)} has ${outside.length} result${outside.length === 1 ? "" : "s"} outside the range printed on it. Please show it to ${name}'s doctor. Open GoldenDose to share it.`,
    });
  }

  // 2. A test that has gone the same way in each of the last 3 reports (and the doctor hasn't seen the latest)
  for (const t of s.tests) {
    if (!t.trend) continue;
    const latestReport = s.reports.find((r) => r.id === t.latest.reportId);
    if (latestReport?.doctorSeenAt) continue;
    const values = t.series.slice(-3).map((x) => num(x.value)).join(" → ");
    add({
      key: `trend-${t.testKey}-${t.latest.reportId}`, severity: "medium",
      title: `${t.testName} has gone ${t.trend} in each of the last 3 reports`,
      detail: `${values}${t.unit ? ` ${t.unit}` : ""}. Worth showing ${name}'s doctor, even if each is within range.`,
      message: `${name}'s ${t.testName} has gone ${t.trend} in each of the last 3 blood reports (${values}). Worth showing ${name}'s doctor.`,
    });
  }

  // 3. The next test the doctor asked for: due soon, or overdue
  for (const t of s.tests) {
    if (t.dueStatus === "overdue") {
      add({
        key: `overdue-${t.testKey}-${t.nextDue}`, severity: "high",
        title: `${t.testName} test is overdue`,
        detail: `The doctor asked for it every ${t.repeatMonths} month${t.repeatMonths === 1 ? "" : "s"}. It was due ${niceDate(t.nextDue)}; the last one was ${niceDate(t.latest.date)}.${s.lab?.phone ? ` Book a home collection with ${s.lab.name || "your lab"}.` : ""}`,
        message: `${name}'s ${t.testName} test is overdue (due ${niceDate(t.nextDue)}). Book a home sample collection from GoldenDose, then add the report.`,
      });
    } else if (t.dueStatus === "due soon") {
      add({
        key: `due-${t.testKey}-${t.nextDue}`, severity: "medium",
        title: `Next ${t.testName} test due by ${niceDate(t.nextDue)}`,
        detail: `Every ${t.repeatMonths} month${t.repeatMonths === 1 ? "" : "s"}, as the doctor asked. ${s.lab?.phone ? `Book a home collection with ${s.lab.name || "your lab"} in one tap.` : "Many labs collect samples at home: add your lab to book in one tap."}`,
        message: `${name}'s next ${t.testName} test is due by ${niceDate(t.nextDue)}.`,
      });
    }
  }

  // 4. Blood pressure checks
  const latestBp = s.bp.readings[0];
  if (s.bp.checkEveryDays) {
    const lastDay = latestBp ? localParts(new Date(latestBp.takenAt), elder.timezone).date : null;
    const gap = lastDay ? daysBetween(lastDay, s.today) : null;
    if (gap === null || gap > s.bp.checkEveryDays) {
      add({
        key: `bp-due-${lastDay ?? "never"}-${Math.floor((gap ?? 0) / s.bp.checkEveryDays)}`, severity: "medium",
        title: gap === null ? `No blood pressure reading yet` : `No blood pressure reading for ${gap} days`,
        detail: `You chose to check every ${s.bp.checkEveryDays} day${s.bp.checkEveryDays === 1 ? "" : "s"}. A home BP machine, or the chemist, can take it.`,
        message: gap === null ? `Time to check ${name}'s blood pressure, and note it in GoldenDose.` : `${name}'s blood pressure hasn't been checked for ${gap} days. Time for a reading.`,
      });
    }
  }
  if (latestBp?.aboveTarget && now - Date.parse(latestBp.takenAt) < 14 * DAY) { // a reading from the last 2 weeks
    const t = s.bp.target;
    add({
      key: `bp-high-${latestBp.id}`, severity: "medium",
      title: `Latest BP ${latestBp.systolic}/${latestBp.diastolic} is above the doctor's target`,
      detail: `Target ${t.systolic}/${t.diastolic ?? "–"}, as the doctor gave. Share the readings with ${name}'s doctor.`,
      message: `${name}'s blood pressure was ${latestBp.systolic}/${latestBp.diastolic}, above the target the doctor gave (${t.systolic}/${t.diastolic ?? "–"}). Please share it with the doctor.`,
    });
  }
  if (!s.bp.checkEveryDays && s.bp.takesBpMedicine) {
    add({
      key: "bp-suggest", severity: "low", messageable: false,
      title: `${name} takes medicine for blood pressure`,
      detail: "Turn on regular BP checks, and add the target the doctor gave, so GoldenDose can remind you.",
    });
  }

  // 5. Weight and blood sugar checks, like BP
  for (const [kind, label, log] of [["weight", "weight", s.weight], ["sugar", "blood sugar", s.sugar]]) {
    if (!log.checkEveryDays) continue;
    const last = log.readings[0];
    const lastDay = last ? localParts(new Date(last.takenAt), elder.timezone).date : null;
    const gap = lastDay ? daysBetween(lastDay, s.today) : null;
    if (gap === null || gap > log.checkEveryDays) {
      add({
        key: `${kind}-due-${lastDay ?? "never"}-${Math.floor((gap ?? 0) / log.checkEveryDays)}`, severity: "medium",
        title: gap === null ? `No ${label} reading yet` : `No ${label} reading for ${gap} days`,
        detail: `You chose to check every ${log.checkEveryDays} day${log.checkEveryDays === 1 ? "" : "s"}.`,
        message: `Time to check ${name}'s ${label}, and note it in GoldenDose.`,
      });
    }
  }
  if (!s.sugar.checkEveryDays && s.sugar.takesSugarMedicine) {
    add({
      key: "sugar-suggest", severity: "low", messageable: false,
      title: `${name} takes medicine for diabetes`,
      detail: "Turn on regular sugar checks if the doctor wants home readings, so GoldenDose can remind you.",
    });
  }
  // Weight: a change of 5% or more within a month is worth telling the doctor (it says what happened, not why)
  const w = s.weight.readings;
  if (w.length >= 2) {
    const latest = w[0];
    const monthAgo = w.find((r) => Date.parse(latest.takenAt) - Date.parse(r.takenAt) >= 21 * DAY && Date.parse(latest.takenAt) - Date.parse(r.takenAt) <= 40 * DAY);
    if (monthAgo && Math.abs(latest.value - monthAgo.value) / monthAgo.value >= 0.05) {
      const change = latest.value - monthAgo.value;
      const since = localParts(new Date(monthAgo.takenAt), elder.timezone).date;
      add({
        key: `weight-change-${latest.id}`, severity: "medium",
        title: `Weight ${change < 0 ? "down" : "up"} ${num(Math.abs(Math.round(change * 10) / 10))} kg since ${niceDate(since)}`,
        detail: `${num(monthAgo.value)} kg → ${num(latest.value)} kg. A change like this is worth telling ${name}'s doctor.`,
        message: `${name}'s weight has gone ${change < 0 ? "down" : "up"} by ${num(Math.abs(Math.round(change * 10) / 10))} kg since ${niceDate(since)}. Worth telling the doctor.`,
      });
    }
  }

  // 6. The next doctor visit
  const openQuestions = s.questions.filter((q) => !q.answeredAt).length;
  if (s.nextVisit) {
    const until = daysBetween(s.today, s.nextVisit.on);
    if (until >= 0 && until <= 7) {
      add({
        key: `visit-${s.nextVisit.on}`, severity: "medium",
        title: until === 0 ? "Doctor visit today" : `Doctor visit on ${niceDate(s.nextVisit.on)}`,
        detail: `${s.nextVisit.note ? `${s.nextVisit.note}. ` : ""}${openQuestions ? `${openQuestions} question${openQuestions === 1 ? "" : "s"} to ask. ` : ""}Take the doctor visit report and the latest blood report.`,
        message: `Reminder: ${name}'s doctor visit is ${until === 0 ? "today" : `on ${niceDate(s.nextVisit.on)}`}. GoldenDose's doctor visit report is ready to print or share.`,
      });
    } else if (until < 0 && until >= -30) {
      add({
        key: `visit-past-${s.nextVisit.on}`, severity: "low", messageable: false,
        title: `Was the doctor visit on ${niceDate(s.nextVisit.on)} done?`,
        detail: "Set the next visit, and add any new prescription or blood report.",
      });
    }
  }
  return nudges;
}

// Sends the family the health nudges they haven't been told about. Runs once an hour, with the pattern check.
export function checkHealth(db, messageCaregivers, now = clock.now()) {
  const elders = db.prepare("SELECT id, name, timezone FROM elders").all();
  const told = db.prepare("SELECT 1 FROM pattern_alerts WHERE elder_id = ? AND pattern_key = ?");
  const remember = db.prepare("INSERT INTO pattern_alerts (elder_id, pattern_key, message, created_at) VALUES (?, ?, ?, ?)");
  let sent = 0;
  for (const elder of elders) {
    for (const n of healthNudgesFor(db, elder, now)) {
      if (!n.messageable || n.severity === "low") continue;
      const key = `health:${n.key}`;
      if (told.get(elder.id, key)) continue;
      messageCaregivers(db, { elder, kind: "health", message: `GoldenDose: ${n.message}` });
      remember.run(elder.id, key, n.message, now.toISOString());
      sent++;
    }
  }
  return sent;
}
