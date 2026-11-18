// Insights: GoldenDose looking at the records so the family doesn't have to.
//
//   patternsFor()   changes worth knowing about: "missed more doses than usual this week",
//                   "most misses are the 8 pm dose", "taking the morning dose later and later"
//   checkupFor()    is everything set up? (a photo for each medicine, the phone connected, a chemist...)
//   attentionFor()  one list of everything that needs the family, most serious first
//   reportFor()     the doctor visit report: what was taken, missed and skipped over a period
//
// These describe what happened. They never give medical advice.

import { clock } from "./clock.js";
import { RULES } from "./config.js";
import { localParts, toMinutes, friendlyTime, addDays } from "./time.js";
import { meterFor } from "./stock.js";
import { healthNudgesFor, healthSummary } from "./health.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const median = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Every recorded dose for an elder between two dates (their local dates), with how late each was taken.
function doseRecords(db, elder, from, to) {
  return db
    .prepare(`SELECT d.date, d.status, d.recorded_at, d.recorded_by, s.time_of_day, m.id AS medicine_id, m.name, m.strength
              FROM dose_log d JOIN schedules s ON s.id = d.schedule_id JOIN medicines m ON m.id = s.medicine_id
              WHERE m.elder_id = ? AND d.date BETWEEN ? AND ?`)
    .all(elder.id, from, to)
    .map((r) => {
      let minutesLate = null;
      if (r.status === "taken") {
        const at = localParts(new Date(r.recorded_at), elder.timezone);
        if (at.date === r.date) minutesLate = at.minutes - toMinutes(r.time_of_day);
      }
      return { ...r, minutesLate };
    });
}

// ---------- Patterns ----------
// Compares the last 7 days with the 3 weeks before. Each pattern has a key, so the same one
// isn't sent to the family more than once a week.
export function patternsFor(db, elder, now = clock.now()) {
  const today = localParts(now, elder.timezone).date;
  const recentFrom = addDays(today, -6);
  const earlierFrom = addDays(today, -27);
  const records = doseRecords(db, elder, earlierFrom, today);
  const recent = records.filter((r) => r.date >= recentFrom);
  const earlier = records.filter((r) => r.date < recentFrom);
  const earlierWeeks = new Set(earlier.map((r) => r.date)).size / 7; // how many weeks of earlier records there are
  const found = [];

  // 1. More missed doses than usual
  const missedNow = recent.filter((r) => r.status === "missed").length;
  if (missedNow >= 3) {
    const usual = earlierWeeks >= 1 ? earlier.filter((r) => r.status === "missed").length / earlierWeeks : null;
    if (usual === null) {
      found.push({ key: "missed-more", message: `${elder.name} missed ${missedNow} doses in the last 7 days.` });
    } else if (missedNow >= 2 * usual + 1) {
      const usually = usual < 0.5 ? "usually almost none" : `usually about ${Math.round(usual)} a week`;
      found.push({ key: "missed-more", message: `${elder.name} missed ${missedNow} doses in the last 7 days, ${usually}.` });
    }
  }

  // 2. One dose time missed again and again
  const byTime = {};
  for (const r of recent.filter((r) => r.status === "missed")) (byTime[r.time_of_day] ??= new Set()).add(r.date);
  // Only when it's one or two dose times: if most times are being missed, the message above already says so.
  const repeated = Object.entries(byTime).filter(([, days]) => days.size >= 3);
  if (repeated.length <= 2) {
    for (const [time, days] of repeated) {
      found.push({ key: `time-${time}`, message: `The ${friendlyTime(time)} dose was missed on ${days.size} of the last 7 days.` });
    }
  }

  // 3. Taking a dose later and later (by 30 minutes or more)
  const times = [...new Set(records.map((r) => r.time_of_day))];
  for (const time of times) {
    const lateness = (list) => list.filter((r) => r.time_of_day === time && r.minutesLate !== null).map((r) => r.minutesLate);
    const now7 = lateness(recent);
    const before = lateness(earlier);
    if (now7.length >= 4 && before.length >= 6) {
      const nowMedian = median(now7);
      const beforeMedian = median(before);
      if (nowMedian - beforeMedian >= 30) {
        const words = (m) => (m <= 10 ? "on time" : `about ${Math.round(m / 5) * 5} minutes late`);
        found.push({
          key: `later-${time}`,
          message: `${elder.name} is taking the ${friendlyTime(time)} dose later than before: ${words(nowMedian)} this week, ${words(beforeMedian)} before.`,
        });
      }
    }
  }

  // 4. Many skipped doses
  const skipped = recent.filter((r) => r.status === "skipped").length;
  if (skipped >= 4) found.push({ key: "skipped-more", message: `${elder.name} chose "Skip" for ${skipped} doses in the last 7 days.` });

  return found;
}

// Tells the family about new patterns. Runs once an hour (see jobs/missedDoses.js).
export function checkPatterns(db, messageCaregivers, now = clock.now()) {
  const elders = db.prepare("SELECT id, name, timezone FROM elders").all();
  const since = new Date(now.getTime() - RULES.PATTERN_REPEAT_DAYS * 86_400_000).toISOString();
  const toldRecently = db.prepare("SELECT 1 FROM pattern_alerts WHERE elder_id = ? AND pattern_key = ? AND created_at >= ?");
  const remember = db.prepare("INSERT INTO pattern_alerts (elder_id, pattern_key, message, created_at) VALUES (?, ?, ?, ?)");
  let told = 0;
  for (const elder of elders) {
    for (const pattern of patternsFor(db, elder, now)) {
      if (toldRecently.get(elder.id, pattern.key, since)) continue;
      messageCaregivers(db, { elder, kind: "pattern", message: `GoldenDose noticed: ${pattern.message}` });
      remember.run(elder.id, pattern.key, pattern.message, now.toISOString());
      told++;
    }
  }
  return told;
}

// ---------- Setup check ----------
const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

export function checkupFor(db, elderId, caregiverId, now = clock.now()) {
  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId);
  const medicines = db.prepare("SELECT * FROM medicines WHERE elder_id = ? AND active = 1 ORDER BY name").all(elderId);
  const phones = db.prepare("SELECT last_seen FROM devices WHERE elder_id = ?").all(elderId);
  const lastSeen = phones.map((p) => p.last_seen).filter(Boolean).sort().pop() ?? null;
  const family = db.prepare("SELECT COUNT(*) AS n FROM care_links WHERE elder_id = ?").get(elderId).n;
  const myLink = db.prepare("SELECT * FROM care_links WHERE elder_id = ? AND caregiver_id = ?").get(elderId, caregiverId);
  const prescriptions = db.prepare("SELECT COUNT(*) AS n FROM prescriptions WHERE elder_id = ?").get(elderId).n;
  const names = (list) => list.map((m) => m.name).join(", ");
  const base = `#/elder/${elderId}`;

  const noPhoto = medicines.filter((m) => !m.photo_url);
  const noPurpose = medicines.filter((m) => !m.purpose);
  const notCounted = medicines.filter((m) => m.stock_count === null);
  const seen = new Map();
  const twice = [];
  for (const m of medicines) {
    const key = squash(m.name);
    if (seen.has(key)) twice.push(m.name);
    seen.set(key, true);
  }
  const quietHours = lastSeen ? (now - new Date(lastSeen)) / 3_600_000 : null;

  const items = [
    { key: "medicines", ok: medicines.length > 0, label: "Medicines added", fix: "Add the first medicine.", link: `${base}/add` },
    { key: "phone", ok: phones.length > 0, label: `${elder.name}'s phone connected`, fix: `Get a connection code and type it on ${elder.name}'s phone.`, link: base },
    { key: "phone-recent", ok: phones.length === 0 || (quietHours !== null && quietHours < RULES.PHONE_QUIET_HOURS),
      label: `${elder.name}'s phone checked in today`,
      fix: lastSeen ? `Not heard from since ${new Date(lastSeen).toLocaleString("en-IN", { timeZone: elder.timezone, dateStyle: "medium", timeStyle: "short" })}. Is it switched on, charged and online?` : "It hasn't opened GoldenDose yet.",
      link: base },
    { key: "photos", ok: medicines.length > 0 && noPhoto.length === 0, label: "A photo of every medicine",
      fix: noPhoto.length ? `No photo yet: ${names(noPhoto)}.` : "Add medicines first.", link: base },
    { key: "purposes", ok: medicines.length > 0 && noPurpose.length === 0, label: "What each medicine is for",
      fix: noPurpose.length ? `Not filled in: ${names(noPurpose)}.` : "Add medicines first.", link: base },
    { key: "meter", ok: medicines.length > 0 && notCounted.length === 0, label: "Tablets counted (medicine meter)",
      fix: notCounted.length ? `Not counted: ${names(notCounted)}.` : "Add medicines first.", link: base },
    { key: "duplicates", ok: twice.length === 0, label: "No medicine listed twice", fix: `Listed more than once: ${twice.join(", ")}. Check with the prescription.`, link: base },
    { key: "chemist", ok: Boolean(elder.chemist_phone), label: "Chemist's WhatsApp number", fix: "Add it to order refills in one tap.", link: `${base}/details` },
    { key: "hospital", ok: Boolean(elder.hospital_phone), label: "Hospital for emergencies", fix: "Add the hospital the emergency button should offer to call.", link: `${base}/details` },
    { key: "prescription", ok: prescriptions > 0, label: "Latest prescription uploaded", fix: "Take a photo of the prescription so it's always at hand.", link: `${base}/prescriptions` },
    { key: "blood-report", ok: db.prepare("SELECT 1 FROM lab_reports WHERE elder_id = ?").get(elderId) !== undefined,
      label: "Latest blood report added", fix: "Add it, with the key numbers, so you're reminded when to show the doctor and when the next test is due.", link: `${base}/health` },
    { key: "alerts", ok: Boolean(myLink && (myLink.notify_sms || myLink.notify_whatsapp || myLink.notify_app)), label: "You'll be told about missed doses",
      fix: "All your alerts are off. Switch on SMS, WhatsApp or app notification.", link: `${base}/settings` },
    { key: "family", ok: family > 1, label: "A second family member as backup", fix: "Invite a brother, sister or neighbour, so someone else is told too.", link: `${base}/settings` },
  ];
  // "Checked in today" only means something once a phone is connected.
  const shown = phones.length ? items : items.filter((i) => i.key !== "phone-recent");
  return { done: shown.filter((i) => i.ok).length, total: shown.length, items: shown, lastSeen };
}

// ---------- Needs attention ----------
const RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

export function attentionFor(db, caregiverId, elderIds = null, now = clock.now()) {
  const links = db
    .prepare(`SELECT e.*, l.role FROM care_links l JOIN elders e ON e.id = l.elder_id WHERE l.caregiver_id = ? ORDER BY e.name`)
    .all(caregiverId)
    .filter((e) => !elderIds || elderIds.includes(e.id));
  const items = [];

  for (const elder of links) {
    const base = `#/elder/${elder.id}`;
    const local = localParts(now, elder.timezone);
    const clockAt = (iso) => friendlyTime(localParts(new Date(iso), elder.timezone).hhmm);
    const add = (severity, kind, title, detail, link = base) =>
      items.push({ severity, kind, elderId: elder.id, elderName: elder.name, title, detail, link });

    // Emergency button in the last 24 hours
    const since = new Date(now.getTime() - 86_400_000).toISOString();
    const emergency = db.prepare("SELECT * FROM emergencies WHERE elder_id = ? AND created_at >= ? ORDER BY created_at DESC").get(elder.id, since);
    if (emergency && !emergency.cancelled_at) {
      add("urgent", "emergency", `${elder.name} pressed the emergency button at ${clockAt(emergency.created_at)}`, `Call ${elder.name} now.`);
    } else if (emergency) {
      add("high", "emergency", `${elder.name} pressed the emergency button at ${clockAt(emergency.created_at)}`,
        `Then pressed "I'm OK" at ${clockAt(emergency.cancelled_at)}. Call to check.`);
    }

    // Doses missed today
    const missed = db
      .prepare(`SELECT s.time_of_day, m.name FROM dose_log d JOIN schedules s ON s.id = d.schedule_id JOIN medicines m ON m.id = s.medicine_id
                WHERE m.elder_id = ? AND d.date = ? AND d.status = 'missed' ORDER BY s.time_of_day`)
      .all(elder.id, local.date);
    if (missed.length) {
      add("high", "missed", `${elder.name} missed ${plural(missed.length, "dose")} today`,
        missed.map((m) => `${m.name} at ${friendlyTime(m.time_of_day)}`).join(", "));
    }

    // The medicine meter: run out, or time to order
    const medicines = db.prepare("SELECT * FROM medicines WHERE elder_id = ? AND active = 1 ORDER BY name").all(elder.id);
    const timesOf = db.prepare("SELECT time_of_day FROM schedules WHERE medicine_id = ? AND active = 1");
    for (const m of medicines) {
      const meter = meterFor(db, m, timesOf.all(m.id).map((s) => s.time_of_day), elder.timezone, now);
      if (!meter?.runningLow) continue;
      const name = `${m.name}${m.strength ? ` ${m.strength}` : ""}`;
      if (meter.daysLeft === 0) {
        add("high", "running-low", `${name} has run out, or runs out today`, "Order now, or count again if you've bought more.");
      } else {
        const by = meter.orderBy <= local.date ? "Order today" : `Order by ${new Date(`${meter.orderBy}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`;
        add("medium", "running-low", `${name}: about ${plural(meter.daysLeft, "day")} left`, `${by}.${m.hard_to_get ? " It's hard to get, so order early." : ""}`);
      }
    }

    // Changes waiting for the main caregiver
    if (elder.role === "owner") {
      const waiting = db
        .prepare(`SELECT p.summary, c.name FROM pending_changes p JOIN caregivers c ON c.id = p.caregiver_id
                  WHERE p.elder_id = ? AND p.status = 'waiting' ORDER BY p.created_at`)
        .all(elder.id);
      for (const w of waiting) add("medium", "approval", `${w.name} wants to ${w.summary}`, "Approve or reject it.", `${base}/changes`);
    }

    // Patterns
    for (const p of patternsFor(db, elder, now)) add("medium", "pattern", p.message, "See the last 7 days.", `${base}/history`);

    // Health records: blood reports to show the doctor, tests due, BP checks, the next doctor visit
    for (const n of healthNudgesFor(db, elder, now)) add(n.severity, "health", n.title, n.detail, n.link);

    // The phone has gone quiet
    const checkup = checkupFor(db, elder.id, caregiverId, now);
    const quiet = checkup.items.find((i) => i.key === "phone-recent");
    if (quiet && !quiet.ok) add("medium", "phone", `${elder.name}'s phone hasn't checked in for a day`, quiet.fix);

    // Setup still to finish (one line, not one per item)
    const todo = checkup.items.filter((i) => !i.ok && i.key !== "phone-recent");
    if (todo.length) {
      add("low", "setup", `Setup: ${checkup.done} of ${checkup.total} done`, todo.slice(0, 3).map((i) => i.label).join(", ") + (todo.length > 3 ? "…" : ""), `${base}/checkup`);
    }
  }

  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

// ---------- The doctor visit report ----------
const inRangeBp = (elder, from, to) => (b) => {
  const d = localParts(new Date(b.takenAt), elder.timezone).date;
  return d >= from && d <= to;
};
export function reportFor(db, elderId, from, to) {
  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId);
  const records = doseRecords(db, elder, from, to);

  const perMedicine = new Map();
  for (const r of records) {
    const entry = perMedicine.get(r.medicine_id) ?? { id: r.medicine_id, name: r.name, strength: r.strength, taken: 0, skipped: 0, missed: 0, late: [] };
    entry[r.status]++;
    if (r.minutesLate !== null) entry.late.push(r.minutesLate);
    perMedicine.set(r.medicine_id, entry);
  }

  const medicines = db.prepare("SELECT * FROM medicines WHERE elder_id = ? AND active = 1 ORDER BY name").all(elderId);
  const timesOf = db.prepare("SELECT time_of_day FROM schedules WHERE medicine_id = ? AND active = 1 ORDER BY time_of_day");
  const rate = (e) => (e.taken + e.skipped + e.missed ? Math.round((100 * e.taken) / (e.taken + e.skipped + e.missed)) : null);

  const rows = [...perMedicine.values()].map((e) => {
    const current = medicines.find((m) => m.id === e.id);
    return {
      id: e.id, name: e.name, strength: e.strength, purpose: current?.purpose ?? "", stillTaking: Boolean(current),
      times: current ? timesOf.all(e.id).map((s) => s.time_of_day) : [],
      taken: e.taken, skipped: e.skipped, missed: e.missed, takenPercent: rate(e),
      usuallyTakenMinutesLate: e.late.length ? Math.round(median(e.late)) : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const totals = rows.reduce((t, r) => ({ taken: t.taken + r.taken, skipped: t.skipped + r.skipped, missed: t.missed + r.missed }), { taken: 0, skipped: 0, missed: 0 });

  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const that = records.filter((r) => r.date === date);
    days.push({ date, taken: that.filter((r) => r.status === "taken").length, total: that.length });
  }

  const startIso = new Date(`${from}T00:00:00Z`).getTime() - 86_400_000; // a little wide; trimmed by local date below
  const inRange = (iso) => { const d = localParts(new Date(iso), elder.timezone).date; return d >= from && d <= to; };
  const emergencies = db.prepare("SELECT * FROM emergencies WHERE elder_id = ? AND created_at >= ? ORDER BY created_at")
    .all(elderId, new Date(startIso).toISOString()).filter((e) => inRange(e.created_at))
    .map((e) => ({ at: e.created_at, cancelledAt: e.cancelled_at }));
  const changes = db.prepare(`SELECT ch.created_at, ch.summary, ch.reason, c.name AS who FROM changes ch LEFT JOIN caregivers c ON c.id = ch.caregiver_id
                              WHERE ch.elder_id = ? AND ch.action IN ('added', 'changed', 'stopped') AND ch.created_at >= ? ORDER BY ch.created_at`)
    .all(elderId, new Date(startIso).toISOString()).filter((c) => inRange(c.created_at))
    .map((c) => ({ at: c.created_at, who: c.who, summary: c.summary, reason: c.reason }));
  const prescriptions = db.prepare("SELECT doctor, issued_on, created_at FROM prescriptions WHERE elder_id = ? ORDER BY COALESCE(issued_on, created_at) DESC")
    .all(elderId).map((p) => ({ doctor: p.doctor, issuedOn: p.issued_on, uploadedAt: p.created_at }));

  const health = healthSummary(db, elderId);
  const bloodReports = health.reports.filter((r) => r.reportDate >= from && r.reportDate <= to)
    .map((r) => ({ date: r.reportDate, lab: r.lab, doctorSeen: Boolean(r.doctorSeenAt), results: r.results }));
  const bpReadings = health.bp.readings.filter(inRangeBp(elder, from, to));
  const readingInRange = (r) => { const d = localParts(new Date(r.takenAt), elder.timezone).date; return d >= from && d <= to; };
  const weightReadings = health.weight.readings.filter(readingInRange);
  const sugarReadings = health.sugar.readings.filter(readingInRange);
  const questions = health.questions.filter((q) => !q.answeredAt).map((q) => ({ text: q.text, addedBy: q.addedBy }));
  const testsDue = health.tests.filter((t) => t.nextDue).map((t) => ({ test: t.testName, nextDue: t.nextDue, status: t.dueStatus, every: t.repeatMonths }));

  return {
    elder: { id: elder.id, name: elder.name, timezone: elder.timezone },
    from, to,
    bloodReports, bpReadings, testsDue, bpTarget: health.bp.target, nextVisit: health.nextVisit,
    weightReadings, sugarReadings, questions,
    totals: { ...totals, takenPercent: rate(totals) },
    medicines: rows,
    currentMedicines: medicines.map((m) => ({ name: m.name, strength: m.strength, purpose: m.purpose, instruction: m.instruction, times: timesOf.all(m.id).map((s) => s.time_of_day) })),
    days, emergencies, changes, prescriptions,
    note: "Made by GoldenDose from the taps on the elder's phone. A dose marked missed means nobody tapped Taken within 30 minutes; it may still have been taken.",
  };
}
