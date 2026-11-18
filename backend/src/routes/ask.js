// I. "Ask GoldenDose": the family asks questions in plain words ("Did Amma take everything this week?")
//    and gets an answer from the elder's own records.
//
// The answer comes from Claude (Anthropic's AI), given the elder's records and strict rules: answer only
// from the records, and never give medical advice. If Claude isn't set up (no ANTHROPIC_API_KEY) or can't
// be reached, GoldenDose answers the common questions itself, more simply.
//
// The AI is OFF unless switched on on purpose, because it is a paid service. To switch it on: get an API key
// at console.anthropic.com, then start the backend with
//   GOLDENDOSE_AI=on ANTHROPIC_API_KEY=sk-ant-... npm start
// Each question then costs a little: about ₹2 to ₹5 with Claude Opus 5.5 (the elder's records are sent along each time).

import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../errors.js";
import { clock } from "../clock.js";
import { requireCaregiver, careLinkOrFail } from "../auth.js";
import { localParts, friendlyTime, toMinutes } from "../time.js";
import { meterFor } from "../stock.js";
import { attentionFor, checkupFor, reportFor } from "../insights.js";
import { healthSummary } from "../health.js";
import * as check from "../validate.js";

export const AI_MODEL = "claude-opus-5-5";

// The rules Claude follows. Kept the same for every question, so Anthropic can reuse it (prompt caching).
const RULES_FOR_CLAUDE = `You are "Ask GoldenDose", the helper inside GoldenDose, a medicine reminder app used by families in India.
A family member (the caregiver) asks about an older relative (the elder). Each question comes with the elder's records from the app as JSON.

How to answer:
- Answer only from the records. If the records don't show it, say so plainly. Never guess or invent doses, times or events.
- Be short and warm: two to five sentences, or a short list. Plain words, no jargon. Use the elder's name.
- Times: 12-hour clock like "8:00 am". Dates: like "Mon 12 Oct". "Missed" means nobody tapped Taken within 30 minutes, so it may still have been taken; say that when it matters.
- Blood reports: say a result is "outside the range printed on the report" only when outsidePrintedRange is true. Never say what a result means for health, never call it good or bad, normal or dangerous; suggest showing it to the doctor.
- "What it's for" comes from the family; it may be blank. You may say what a medicine is commonly used for in general terms, and add that the doctor may have prescribed it for another reason.
- If the family's question is in Hindi or another Indian language, or in Hinglish, answer in the same language and style.

Never give medical advice. Do not tell anyone to start, stop, skip, double, change or swap a medicine or dose, do not judge whether a dose, combination or symptom is safe, and do not diagnose. For those questions, say kindly that the elder's doctor or pharmacist should answer, and offer what the records do show.
If the question suggests the elder is unwell right now (chest pain, a fall, breathlessness, confusion, fainting, very high or low sugar), say first: call 108 (ambulance) or the doctor now.`;

const MEDICAL = /\b(side ?effects?|overdose|double (the )?dose|extra (dose|tablet)|should (she|he|i|they)|can (she|he|i|they) (take|stop|skip|eat|have)|is it (safe|ok|okay)|safe to|interact|instead of|replace|increase|decrease|reduce the dose|stop (taking|the)|dosage|how much should)\b/i;
const URGENT = /\b(chest pain|fell|fallen|fall down|faint|unconscious|breathless|can'?t breathe|confus|stroke|bleeding|very (high|low) sugar|hypo)\b/i;

// Everything about the elder that might help answer, in a compact form.
function recordsFor(db, elderId, caregiverId) {
  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId);
  const now = clock.now();
  const local = localParts(now, elder.timezone);
  const back = (days) => { const d = new Date(`${local.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
  const medicines = db.prepare("SELECT * FROM medicines WHERE elder_id = ? AND active = 1 ORDER BY name").all(elderId);
  const timesOf = db.prepare("SELECT time_of_day FROM schedules WHERE medicine_id = ? AND active = 1 ORDER BY time_of_day");
  const recent = db
    .prepare(`SELECT d.date, s.time_of_day AS time, m.name, d.status, d.recorded_at FROM dose_log d
              JOIN schedules s ON s.id = d.schedule_id JOIN medicines m ON m.id = s.medicine_id
              WHERE m.elder_id = ? AND d.date >= ? ORDER BY d.date, s.time_of_day`)
    .all(elderId, back(13))
    .map((r) => ({ date: r.date, due: r.time, medicine: r.name, status: r.status,
      at: r.status === "taken" ? localParts(new Date(r.recorded_at), elder.timezone).hhmm : undefined }));

  return {
    elder: elder.name,
    now: { date: local.date, time: local.hhmm, timezone: elder.timezone },
    medicines: medicines.map((m) => {
      const times = timesOf.all(m.id).map((s) => s.time_of_day);
      const meter = meterFor(db, m, times, elder.timezone, now);
      return {
        name: m.name, strength: m.strength, whatItsFor: m.purpose || null, instruction: m.instruction, times,
        tabletsLeft: meter?.tabletsLeft ?? null, daysLeft: meter?.daysLeft ?? null, orderBy: meter?.orderBy ?? null,
      };
    }),
    dosesLast14Days: recent,
    report30Days: (({ totals, medicines: rows }) => ({ totals, perMedicine: rows.map(({ name, taken, skipped, missed, takenPercent }) => ({ name, taken, skipped, missed, takenPercent })) }))(reportFor(db, elderId, back(29), local.date)),
    needsAttention: attentionFor(db, caregiverId, [elderId], now).map(({ severity, title, detail }) => ({ severity, title, detail })),
    setup: checkupFor(db, elderId, caregiverId, now).items.filter((i) => !i.ok).map((i) => i.label),
    emergencyButton: db.prepare("SELECT created_at, cancelled_at FROM emergencies WHERE elder_id = ? ORDER BY created_at DESC LIMIT 5").all(elderId),
    prescriptions: db.prepare("SELECT doctor, issued_on FROM prescriptions WHERE elder_id = ? ORDER BY COALESCE(issued_on, created_at) DESC LIMIT 5").all(elderId),
    recentChanges: db.prepare("SELECT ch.created_at AS at, c.name AS who, ch.summary, ch.reason FROM changes ch LEFT JOIN caregivers c ON c.id = ch.caregiver_id WHERE ch.elder_id = ? ORDER BY ch.created_at DESC LIMIT 10").all(elderId),
    chemist: elder.chemist_name || (elder.chemist_phone ? "set" : null),
    health: (({ reports, tests, bp, nextVisit, weight, sugar, questions, lab }) => ({
      bloodReports: reports.slice(0, 6).map((x) => ({ date: x.reportDate, lab: x.lab, doctorSeen: Boolean(x.doctorSeenAt),
        results: x.results.map((t) => ({ test: t.testName, value: t.value, unit: t.unit, printedRange: t.range, outsidePrintedRange: t.flag === "high" || t.flag === "low" })) })),
      tests: tests.map((t) => ({ test: t.testName, latest: t.latest, trendLast3: t.trend, repeatEveryMonths: t.repeatMonths, nextDue: t.nextDue, status: t.dueStatus })),
      bloodPressure: { checkEveryDays: bp.checkEveryDays, doctorsTarget: bp.target, readings: bp.readings.slice(0, 10) },
      nextDoctorVisit: nextVisit,
      weightKg: weight.readings.slice(0, 10).map(({ value, takenAt }) => ({ value, takenAt })),
      bloodSugar: sugar.readings.slice(0, 10).map(({ value, context, takenAt }) => ({ mgdl: value, when: context, takenAt })),
      questionsForDoctor: questions.filter((q) => !q.answeredAt).map((q) => q.text),
      familysLab: lab,
    }))(healthSummary(db, elderId)),
  };
}

// ---------- Simple answers, without AI ----------
const list = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
// "2026-10-16" → "Fri 16 Oct"
const day = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Everyday words for conditions, so "Which one is for BP?" finds "High blood pressure".
const CONDITIONS = [
  [/\b(bp|blood pressure|pressure)\b/, /blood pressure/i],
  [/\b(sugar|diabetes|diabetic|madhumeh)\b/, /diabetes|blood sugar/i],
  [/\b(cholesterol|lipid)\b/, /cholesterol|triglyceride/i],
  [/\b(thyroid)\b/, /thyroid/i],
  [/\b(heart|dil)\b/, /heart|angina|blood thinner/i],
  [/\b(bones?|calcium|joints?|haddi)\b/, /bone|calcium|joint|arthritis/i],
  [/\b(acidity|gas|stomach|pet)\b/, /acid|stomach|nausea/i],
  [/\b(vitamin)\b/, /vitamin/i],
];

function simpleAnswer(question, r) {
  const q = question.toLowerCase();
  const name = r.elder;
  if (URGENT.test(question)) return `If ${name} is unwell right now, call 108 (ambulance) or the doctor straight away. GoldenDose can't judge symptoms.`;
  if (MEDICAL.test(question)) return `That's a question for ${name}'s doctor or pharmacist: GoldenDose doesn't give medical advice. I can tell you what was taken, missed or skipped, and when.`;

  const asked = r.medicines.find((m) => q.includes(m.name.toLowerCase()));
  if (asked && /\b(for|why|what is|kis ?liye|kya hai)\b/.test(q)) {
    return asked.whatItsFor
      ? `${asked.name} is for: ${asked.whatItsFor} (as the family wrote it). ${name} takes it at ${list(asked.times.map(friendlyTime))}.`
      : `Nobody has filled in what ${asked.name} is for yet. Check the prescription, or ask the doctor, then add it on the medicine's page.`;
  }
  // Health records: tests due, the latest blood report, blood pressure, the next doctor visit
  const h = r.health;
  if (/\b(next|due|when)\b/.test(q) && /\b(test|report|blood test|hba1c|sugar test|lab)\b/.test(q)) {
    const due = h.tests.filter((t) => t.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    if (!due.length) return `No repeat tests are set yet. On ${name}'s Health page, choose how often the doctor wants each test repeated.`;
    return due.map((t) => `${t.test}: ${t.status === "overdue" ? "overdue, was due" : "due by"} ${day(t.nextDue)} (every ${t.repeatEveryMonths} month${t.repeatEveryMonths === 1 ? "" : "s"})`).join(". ") + ".";
  }
  if (/\b(blood report|report|results?|lab)\b/.test(q) && !/\b(doctor visit report)\b/.test(q)) {
    const latest = h.bloodReports[0];
    if (!latest) return `No blood reports have been added yet. Add one on ${name}'s Health page.`;
    const outside = latest.results.filter((x) => x.outsidePrintedRange);
    return `The latest blood report is from ${day(latest.date)}${latest.lab ? ` (${latest.lab})` : ""}, with ${latest.results.length} results. ` +
      (outside.length ? `Outside the range printed on it: ${outside.map((x) => `${x.test} ${x.value}${x.unit ? ` ${x.unit}` : ""} (range ${x.printedRange})`).join("; ")}. ` : "All results are within the ranges printed on it. ") +
      (latest.doctorSeen ? "The doctor has seen it." : `Please show it to ${name}'s doctor. GoldenDose doesn't interpret results.`);
  }
  if (/\b(bp|blood pressure)\b/.test(q) && !/\bfor\b/.test(q)) {
    const b = h.bloodPressure.readings[0];
    if (!b) return `No blood pressure readings yet. Add one on ${name}'s Health page.`;
    return `The latest blood pressure reading is ${b.systolic}/${b.diastolic}${b.pulse ? `, pulse ${b.pulse}` : ""}, taken ${day(b.takenAt.slice(0, 10))}.` +
      (h.bloodPressure.doctorsTarget ? ` The doctor's target is ${h.bloodPressure.doctorsTarget.systolic}/${h.bloodPressure.doctorsTarget.diastolic ?? "–"}${b.aboveTarget ? ", and this reading is above it: please share it with the doctor" : ""}.` : "");
  }
  if (/\b(sugar|glucose)\b/.test(q) && /\b(last|latest|reading|level|check)\b/.test(q) && !/\b(test|report)\b/.test(q)) {
    const s = h.bloodSugar[0];
    if (!s) return `No blood sugar readings yet. Add one on ${name}'s Health page.`;
    return `The latest blood sugar reading is ${s.mgdl} mg/dL (${s.when.replace("-", " ")}), taken ${day(s.takenAt.slice(0, 10))}. GoldenDose doesn't interpret readings: share them with the doctor.`;
  }
  if (/\b(weight|weigh)\b/.test(q)) {
    const w = h.weightKg;
    if (!w.length) return `No weight readings yet. Add one on ${name}'s Health page.`;
    return `The latest weight is ${w[0].value} kg, taken ${day(w[0].takenAt.slice(0, 10))}.` + (w.length > 1 ? ` Before that: ${w.slice(1, 4).map((x) => `${x.value} kg on ${day(x.takenAt.slice(0, 10))}`).join(", ")}.` : "");
  }
  if (/\bquestions?\b/.test(q)) {
    const list = h.questionsForDoctor;
    return list.length ? `Questions for the doctor: ${list.map((x, i) => `${i + 1}. ${x}`).join(" ")}` : `No questions for the doctor yet. Add them on ${name}'s Health page.`;
  }
  if (/\b(doctor visit|appointment|visit)\b/.test(q)) {
    return h.nextDoctorVisit ? `${name}'s next doctor visit is on ${day(h.nextDoctorVisit.on)}${h.nextDoctorVisit.note ? ` (${h.nextDoctorVisit.note})` : ""}.` : `No doctor visit is set. Add the next one on ${name}'s Health page.`;
  }

  const condition = CONDITIONS.find(([words]) => words.test(q));
  if (condition && /\b(for|which|kaun|kaunsi|konsi|what)\b/.test(q)) {
    const matches = r.medicines.filter((m) => m.whatItsFor && condition[1].test(m.whatItsFor));
    return matches.length
      ? `${list(matches.map((m) => `${m.name}${m.strength ? ` ${m.strength}` : ""} (${m.whatItsFor}, at ${list(m.times.map(friendlyTime))})`))}.`
      : `None of ${name}'s medicines say that in "What it's for". Check the prescription, or fill it in on each medicine's page.`;
  }
  if (/\b(chang|changed|change|badla|history)\w*/.test(q)) {
    const recent = r.recentChanges.slice(0, 3);
    if (!recent.length) return "No changes have been recorded yet.";
    return recent.map((c) => `${day(c.at.slice(0, 10))}: ${c.who ?? "Someone"}: ${c.summary}${c.reason ? ` (why: ${c.reason})` : ""}`).join(". ") + ".";
  }
  if (/\b(for|why|kis ?liye)\b/.test(q) && /\b(each|all|every|medicines?|tablets?|dawai|dawa)\b/.test(q)) {
    return r.medicines.map((m) => `${m.name}: ${m.whatItsFor ?? "not filled in yet"}`).join(". ") + ". (As the family wrote it; the doctor can confirm.)";
  }
  if (/\b(week|7 days|hafte|hafta)\b/.test(q) && !/\b(miss|missed)\b/.test(q)) {
    const from = r.dosesLast14Days.length ? r.dosesLast14Days.at(-1).date : r.now.date;
    const weekStart = new Date(Date.parse(`${from}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
    const week = r.dosesLast14Days.filter((d) => d.date >= weekStart);
    const taken = week.filter((d) => d.status === "taken").length;
    const missed = week.filter((d) => d.status === "missed");
    return `In the last 7 days ${name} took ${taken} of ${week.length} recorded doses.` +
      (missed.length ? ` Missed: ${missed.map((d) => `${d.medicine} at ${friendlyTime(d.due)} on ${day(d.date)}`).join("; ")}.` : " Nothing was missed.");
  }
  if (/\b(low|refill|order|stock|left|run out|running|khatam|chemist)\b/.test(q)) {
    const counted = r.medicines.filter((m) => m.daysLeft !== null);
    if (!counted.length) return "No tablets have been counted yet. Count them on each medicine's page to use the medicine meter.";
    return counted.map((m) => `${m.name}: about ${m.daysLeft} day${m.daysLeft === 1 ? "" : "s"} left (${m.tabletsLeft} tablets), order by ${day(m.orderBy)}`).join(". ") + ".";
  }
  if (/\b(miss|missed|chhoot|bhool|forgot)\b/.test(q)) {
    const missed = r.dosesLast14Days.filter((d) => d.status === "missed");
    if (!missed.length) return `${name} hasn't missed any doses in the last 14 days.`;
    const shown = missed.slice(-8); // the most recent ones
    return `In the last 14 days ${name} missed ${missed.length} dose${missed.length === 1 ? "" : "s"}${missed.length > shown.length ? `; the latest ${shown.length}` : ""}: ` +
      `${shown.map((d) => `${d.medicine} at ${friendlyTime(d.due)} on ${day(d.date)}`).join("; ")}. "Missed" means nobody tapped Taken within 30 minutes.`;
  }
  if (/\b(next|kab|when)\b/.test(q)) {
    const nowMin = toMinutes(r.now.time);
    const next = r.medicines.flatMap((m) => m.times.map((t) => ({ m, t }))).filter((x) => toMinutes(x.t) > nowMin).sort((a, b) => a.t.localeCompare(b.t))[0];
    return next ? `${name}'s next dose is ${next.m.name} at ${friendlyTime(next.t)}.` : `No more doses today for ${name}.`;
  }
  const today = r.dosesLast14Days.filter((d) => d.date === r.now.date);
  const taken = today.filter((d) => d.status === "taken").length;
  const urgent = r.needsAttention.filter((a) => a.severity === "urgent" || a.severity === "high");
  return `Today ${name} has taken ${taken} dose${taken === 1 ? "" : "s"} so far. ` +
    (urgent.length ? `Needs attention: ${urgent.map((a) => a.title).join("; ")}. ` : "Nothing urgent needs attention. ") +
    `Over the last 30 days, ${r.report30Days.totals.takenPercent ?? 0}% of recorded doses were taken.`;
}

// ---------- Claude ----------
let client = null;
async function askClaude(question, history, records) {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: `<records>\n${JSON.stringify(records)}\n</records>\n\nQuestion: ${question}` },
  ];
  const response = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },          // short answers to everyday questions don't need deep thinking
    cache_control: { type: "ephemeral" },       // reuse the unchanging rules between questions
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",                       // if a safety check wrongly declines, Anthropic retries on another model
    system: RULES_FOR_CLAUDE,
    messages,
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return text || null;
}

export function askRoutes(db) {
  const router = Router();

  // POST /api/elders/:id/ask  { question, history: [{ role: "user" | "assistant", text }] }
  router.post("/elders/:id/ask", requireCaregiver, async (req, res, next) => {
    try {
      const elderId = check.id(req.params.id);
      careLinkOrFail(db, req.caregiverId, elderId);
      const question = check.text(req.body?.question, "question", { max: 500 });
      const rawHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];
      const history = rawHistory
        .filter((h) => (h?.role === "user" || h?.role === "assistant") && typeof h.text === "string" && h.text.trim())
        .map((h) => ({ role: h.role, text: h.text.slice(0, 2000) }));
      // The conversation must alternate and start with the family's question.
      while (history.length && history[0].role !== "user") history.shift();
      if (history.length && history.at(-1).role === "user") history.pop();

      const records = recordsFor(db, elderId, req.caregiverId);
      let answer = null;
      let source = "simple";
      let note = null;

      if (process.env.GOLDENDOSE_AI === "on" && process.env.ANTHROPIC_API_KEY) {
        try {
          answer = await askClaude(question, history, records);
          if (answer) source = "ai";
          else note = "The AI didn't answer that one, so here's a simple answer instead.";
        } catch (error) {
          if (error instanceof Anthropic.AuthenticationError || !process.env.ANTHROPIC_API_KEY) {
            note = "Smart answers are off: the AI isn't set up yet (it needs an Anthropic API key). Here's a simple answer.";
          } else if (error instanceof Anthropic.RateLimitError) {
            note = "The AI is busy right now. Here's a simple answer; try again in a minute for a fuller one.";
          } else if (error instanceof Anthropic.APIError) {
            console.error("Ask GoldenDose: AI error", error.status, error.message);
            note = "The AI couldn't be reached. Here's a simple answer.";
          } else {
            console.error("Ask GoldenDose: AI not available:", error.message);
            note = "Smart answers are off: the AI isn't set up yet (it needs an Anthropic API key). Here's a simple answer.";
          }
        }
      }
      if (!answer) answer = simpleAnswer(question, records);
      res.json({ answer, source, note });
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      next(error);
    }
  });

  return router;
}
