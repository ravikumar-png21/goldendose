// Tests for health records: blood reports, results outside the printed range, trends, tests due,
// blood pressure checks, the next doctor visit, and the reminders sent to the family.
// GoldenDose never interprets results, so the tests also check the wording stays factual.
//
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";
import { checkHealth } from "../src/health.js";
import { messageCaregivers } from "../src/notify.js";
import { findLeftovers } from "../scripts/leftover-files.js";

process.env.QUIET = "1";
process.env.GOLDENDOSE_AI = "off";
process.env.SIGN_IN_DAYS = "3650"; // these tests jump months ahead on the pretend clock; keep Priya signed in throughout
process.env.PRESCRIPTIONS_DIR = mkdtempSync(join(tmpdir(), "goldendose-health-"));
process.env.PHOTOS_DIR = mkdtempSync(join(tmpdir(), "goldendose-health-photos-"));

let current = new Date("2026-10-27T10:00:00+05:30");
clock.now = () => current;

let server, base, db;
before(async () => {
  db = openDatabase(":memory:");
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}`;
});
after(() => {
  server.close();
  rmSync(process.env.PRESCRIPTIONS_DIR, { recursive: true, force: true });
  rmSync(process.env.PHOTOS_DIR, { recursive: true, force: true });
});

async function call(method, path, { token, body, raw, type } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(raw ? { "Content-Type": type } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();
  const json = (response.headers.get("content-type") ?? "").includes("json");
  return { status: response.status, body: text && json ? JSON.parse(text) : text, headers: response.headers };
}
const s = {};
const attention = async () => (await call("GET", `/api/elders/${s.kamalaId}/attention`, { token: s.priya })).body.filter((a) => a.kind === "health");
const addReport = (body) => call("POST", `/api/elders/${s.kamalaId}/lab-reports`, { token: s.priya, body });

test("setup", async () => {
  s.priya = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.stranger = (await call("POST", "/api/auth/signup", { body: { name: "X", email: "x@example.com", password: "long-password" } })).body.token;
  s.kamalaId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Kamala" } })).body.id;
});

test("the list of common tests has names and units, but no ranges of our own", async () => {
  const r = await call("GET", "/api/lab-tests", { token: s.priya });
  const hba1c = r.body.find((t) => t.key === "hba1c");
  assert.equal(hba1c.unit, "%");
  assert.ok(r.body.every((t) => !("rangeLow" in t) && !("normal" in t)));
});

test("a blood report: results are flagged only against the range printed on it", async () => {
  const r = await addReport({
    reportDate: "2026-10-20", lab: "City Lab",
    results: [
      { testKey: "hba1c", value: 8.2, rangeLow: 4, rangeHigh: 5.6 },
      { testKey: "creatinine", value: 1.0, rangeLow: 0.6, rangeHigh: 1.2 },
      { testKey: "vitd", value: 18 },                                   // no range printed: no flag
      { testName: "Ferritin", value: 30, unit: "ng/mL", rangeLow: 15, rangeHigh: 150 },
    ],
  });
  assert.equal(r.status, 201);
  s.reportId = r.body.id;
  const flags = Object.fromEntries(r.body.results.map((x) => [x.testName, x.flag]));
  assert.deepEqual(flags, { HbA1c: "high", Creatinine: "in range", "Vitamin D": null, Ferritin: "in range" });
  assert.equal(r.body.results[0].unit, "%");                             // unit filled in from the list
  assert.equal(r.body.results[3].testKey, "other:ferritin");
  assert.equal(r.body.outsideRange, 1);
});

test("wrong numbers are refused with a clear message", async () => {
  const backwards = await addReport({ reportDate: "2026-10-20", results: [{ testKey: "hba1c", value: 7, rangeLow: 6, rangeHigh: 4 }] });
  assert.equal(backwards.status, 400);
  assert.match(backwards.body.error, /low end of the range is above the high end/);
  assert.equal((await addReport({ reportDate: "20/10/2026", results: [] })).status, 400);
});

test("Needs attention: show the doctor, until the family marks that the doctor has seen it", async () => {
  let items = await attention();
  const report = items.find((a) => /blood report/.test(a.title));
  assert.equal(report.severity, "high");
  assert.match(report.title, /1 result outside the printed range/);
  assert.match(report.detail, /HbA1c 8\.2 % \(range 4–5\.6\)\. Has Kamala's doctor seen it\?/);
  assert.doesNotMatch(report.title + report.detail, /diabet|danger|normal|abnormal|bad/i); // factual words only

  const seen = await call("POST", `/api/lab-reports/${s.reportId}/doctor-seen`, { token: s.priya });
  assert.equal(seen.body.doctorSeenBy, "Priya");
  items = await attention();
  assert.ok(!items.some((a) => /blood report/.test(a.title)));
});

test("the report file is private to the family", async () => {
  const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");
  const up = await call("POST", `/api/lab-reports/${s.reportId}/file`, { token: s.priya, raw: PDF, type: "application/pdf" });
  assert.equal(up.status, 201);
  assert.equal((await call("GET", `/api/lab-reports/${s.reportId}/file`, { token: s.priya })).status, 200);
  assert.equal((await call("GET", `/api/lab-reports/${s.reportId}/file`, { token: s.stranger })).status, 403);
});

test("a test going up in each of the last 3 reports is worth showing the doctor", async () => {
  await addReport({ reportDate: "2026-04-10", results: [{ testKey: "creatinine", value: 0.8, rangeLow: 0.6, rangeHigh: 1.2 }] });
  await addReport({ reportDate: "2026-07-10", results: [{ testKey: "creatinine", value: 0.9, rangeLow: 0.6, rangeHigh: 1.2 }] });
  // the 20 Oct report has 1.0, but the doctor has seen it, so add a newer one the doctor hasn't
  await addReport({ reportDate: "2026-10-25", results: [{ testKey: "creatinine", value: 1.1, rangeLow: 0.6, rangeHigh: 1.2 }] });
  const trend = (await attention()).find((a) => /gone up/.test(a.title));
  assert.equal(trend.title, "Creatinine has gone up in each of the last 3 reports");
  assert.match(trend.detail, /0\.9 → 1 → 1\.1 mg\/dL\. Worth showing Kamala's doctor, even if each is within range\./);
});

test("the next test: due soon, then overdue, as often as the doctor asked", async () => {
  const set = await call("PUT", `/api/elders/${s.kamalaId}/test-followups`, { token: s.priya, body: { testKey: "hba1c", repeatMonths: 3 } });
  assert.equal(set.body.repeatMonths, 3);
  const summary = (await call("GET", `/api/elders/${s.kamalaId}/health-summary`, { token: s.priya })).body;
  const hba1c = summary.tests.find((t) => t.testKey === "hba1c");
  assert.equal(hba1c.nextDue, "2027-01-20");                           // 20 Oct + 3 months
  assert.equal(hba1c.dueStatus, "later");

  current = new Date("2027-01-15T10:00:00+05:30");
  assert.match((await attention()).find((a) => /HbA1c/.test(a.title)).title, /^Next HbA1c test due by/);
  current = new Date("2027-01-25T10:00:00+05:30");
  const overdue = (await attention()).find((a) => /HbA1c/.test(a.title));
  assert.equal(overdue.title, "HbA1c test is overdue");
  assert.equal(overdue.severity, "high");
  current = new Date("2026-10-27T10:00:00+05:30");
});

test("blood pressure: a suggestion for BP medicine, reminders when checks are due, and the doctor's target", async () => {
  await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Telma", purpose: "High blood pressure", times: ["09:00"] } });
  assert.ok((await attention()).some((a) => a.title === "Kamala takes medicine for blood pressure" && a.severity === "low"));

  await call("PUT", `/api/elders/${s.kamalaId}/health-settings`, { token: s.priya, body: { bpCheckDays: 7, bpTarget: { systolic: 140, diastolic: 90 } } });
  assert.ok((await attention()).some((a) => a.title === "No blood pressure reading yet"));

  assert.equal((await call("POST", `/api/elders/${s.kamalaId}/bp`, { token: s.priya, body: { systolic: 80, diastolic: 120 } })).status, 400);
  current = new Date("2026-10-27T08:00:00+05:30");
  await call("POST", `/api/elders/${s.kamalaId}/bp`, { token: s.priya, body: { systolic: 162, diastolic: 95, pulse: 78 } });
  current = new Date("2026-10-27T10:00:00+05:30");
  let items = await attention();
  assert.ok(!items.some((a) => /No blood pressure reading/.test(a.title)));
  assert.ok(items.some((a) => a.title === "Latest BP 162/95 is above the doctor's target"));

  current = new Date("2026-11-06T10:00:00+05:30");
  items = await attention();
  assert.ok(items.some((a) => a.title === "No blood pressure reading for 10 days"));
  current = new Date("2026-10-27T10:00:00+05:30");
});

test("the next doctor visit: a reminder in the week before", async () => {
  await call("PUT", `/api/elders/${s.kamalaId}/health-settings`, { token: s.priya, body: { nextVisit: { on: "2026-10-30", note: "Dr. Rao, sugar review" } } });
  const visit = (await attention()).find((a) => /Doctor visit/.test(a.title));
  assert.equal(visit.title, "Doctor visit on Fri, 30 Oct");
  assert.match(visit.detail, /Dr\. Rao, sugar review\. Take the doctor visit report/);
});

test("the family is told each reminder once, by message", () => {
  const first = checkHealth(db, messageCaregivers);
  assert.ok(first >= 3);
  assert.equal(checkHealth(db, messageCaregivers), 0);
  const messages = db.prepare("SELECT message FROM other_notifications WHERE kind = 'health'").all().map((m) => m.message);
  assert.ok(messages.some((m) => /blood pressure was 162\/95, above the target the doctor gave/.test(m)));
  assert.ok(!messages.some((m) => /takes medicine for blood pressure/.test(m))); // suggestions stay in the app
});

test("the doctor visit report includes blood results, BP readings and tests due", async () => {
  const r = (await call("GET", `/api/elders/${s.kamalaId}/report?from=2026-09-28&to=2026-10-27`, { token: s.priya })).body;
  assert.equal(r.bloodReports.length, 2);
  assert.equal(r.bpReadings[0].systolic, 162);
  assert.equal(r.testsDue[0].test, "HbA1c");
  assert.equal(r.nextVisit.on, "2026-10-30");
});

test("Ask answers about tests due, the latest report and BP, without interpreting", async () => {
  const ask = async (question) => (await call("POST", `/api/elders/${s.kamalaId}/ask`, { token: s.priya, body: { question } })).body.answer;
  assert.match(await ask("When is the next blood test due?"), /^HbA1c: due by/);
  const latest = await ask("What did the latest blood report say?");
  assert.match(latest, /latest blood report is from Sun, 25 Oct/);
  assert.match(latest, /GoldenDose doesn't interpret results/);
  assert.match(await ask("What was her last BP?"), /162\/95.*above it: please share it with the doctor/);
  assert.match(await ask("When is the doctor visit?"), /Fri, 30 Oct \(Dr\. Rao, sugar review\)/);
});

test("the family's lab: test reminders offer to book a home collection", async () => {
  await call("PUT", `/api/elders/${s.kamalaId}/health-settings`, { token: s.priya, body: { lab: { name: "City Diagnostics", phone: "+91 98450 22222" } } });
  const summary = (await call("GET", `/api/elders/${s.kamalaId}/health-summary`, { token: s.priya })).body;
  assert.deepEqual(summary.lab, { name: "City Diagnostics", phone: "+91 98450 22222" });
  current = new Date("2027-01-15T10:00:00+05:30");
  const due = (await attention()).find((a) => /Next HbA1c test due/.test(a.title));
  assert.match(due.detail, /Book a home collection with City Diagnostics in one tap/);
  current = new Date("2026-10-27T10:00:00+05:30");
});

test("weight and sugar logs: sensible numbers only, sugar with when it was checked", async () => {
  assert.equal((await call("POST", `/api/elders/${s.kamalaId}/readings`, { token: s.priya, body: { kind: "weight", value: 5 } })).status, 400);
  assert.equal((await call("POST", `/api/elders/${s.kamalaId}/readings`, { token: s.priya, body: { kind: "sugar", value: 140, context: "lunch" } })).status, 400);
  const sugar = await call("POST", `/api/elders/${s.kamalaId}/readings`, { token: s.priya, body: { kind: "sugar", value: 148, context: "fasting" } });
  assert.equal(sugar.status, 201);
  assert.equal(sugar.body.context, "fasting");
});

test("a medicine for diabetes suggests sugar checks; checks due remind the family", async () => {
  await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Metformin", purpose: "Diabetes (blood sugar)", times: ["08:00"] } });
  await call("PUT", `/api/elders/${s.kamalaId}/health-settings`, { token: s.priya, body: { sugarCheckDays: null } });
  assert.ok((await attention()).some((a) => a.title === "Kamala takes medicine for diabetes" && a.severity === "low"));
  await call("PUT", `/api/elders/${s.kamalaId}/health-settings`, { token: s.priya, body: { weightCheckDays: 7, sugarCheckDays: 3 } });
  const items = await attention();
  assert.ok(items.some((a) => a.title === "No weight reading yet"));
  assert.ok(!items.some((a) => /No blood sugar reading/.test(a.title))); // checked today
});

test("weight: a change of 5% or more in about a month is worth telling the doctor", async () => {
  current = new Date("2026-09-28T09:00:00+05:30");
  await call("POST", `/api/elders/${s.kamalaId}/readings`, { token: s.priya, body: { kind: "weight", value: 62 } });
  current = new Date("2026-10-27T09:00:00+05:30");
  await call("POST", `/api/elders/${s.kamalaId}/readings`, { token: s.priya, body: { kind: "weight", value: 58.5 } });
  current = new Date("2026-10-27T10:00:00+05:30");
  const change = (await attention()).find((a) => /^Weight down/.test(a.title));
  assert.equal(change.title, "Weight down 3.5 kg since Mon, 28 Sept");
  assert.match(change.detail, /62 kg → 58\.5 kg\. A change like this is worth telling Kamala's doctor\./);
});

test("questions for the doctor: added by the family, counted in the visit reminder, printed in the report", async () => {
  const q1 = await call("POST", `/api/elders/${s.kamalaId}/doctor-questions`, { token: s.priya, body: { text: "Can the evening Metformin be taken with dinner?" } });
  await call("POST", `/api/elders/${s.kamalaId}/doctor-questions`, { token: s.priya, body: { text: "Is the knee pain from a medicine?" } });
  assert.equal(q1.status, 201);
  const visit = (await attention()).find((a) => /Doctor visit/.test(a.title));
  assert.match(visit.detail, /2 questions to ask/);

  await call("PUT", `/api/doctor-questions/${q1.body.id}`, { token: s.priya, body: { answered: true, answer: "Yes, with dinner is fine" } });
  const r = (await call("GET", `/api/elders/${s.kamalaId}/report?from=2026-09-28&to=2026-10-27`, { token: s.priya })).body;
  assert.deepEqual(r.questions.map((q) => q.text), ["Is the knee pain from a medicine?"]);
  assert.equal(r.weightReadings.length, 2);
  assert.equal(r.sugarReadings[0].value, 148);
});

test("Ask: weight, sugar and questions for the doctor", async () => {
  const ask = async (question) => (await call("POST", `/api/elders/${s.kamalaId}/ask`, { token: s.priya, body: { question } })).body.answer;
  assert.match(await ask("What is her weight?"), /^The latest weight is 58\.5 kg/);
  assert.match(await ask("What was her last sugar reading?"), /148 mg\/dL \(fasting\)/);
  assert.match(await ask("What questions do we have for the doctor?"), /1\. Is the knee pain from a medicine\?/);
});

test("deleting a report removes its results too", async () => {
  assert.equal((await call("DELETE", `/api/lab-reports/${s.reportId}`, { token: s.priya })).status, 204);
  const left = db.prepare("SELECT COUNT(*) AS n FROM lab_results WHERE report_id = ?").get(s.reportId).n;
  assert.equal(left, 0);
});

test("removing a person removes every file kept for them: prescriptions and blood reports", async () => {
  const PDF = Buffer.from("%PDF-1.4 test file");
  const tempId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Temp" } })).body.id;
  const before = readdirSync(process.env.PRESCRIPTIONS_DIR).length;
  await call("POST", `/api/elders/${tempId}/prescriptions`, { token: s.priya, raw: PDF, type: "application/pdf" });
  const report = await call("POST", `/api/elders/${tempId}/lab-reports`, { token: s.priya, body: { reportDate: "2026-10-01", results: [] } });
  await call("POST", `/api/lab-reports/${report.body.id}/file`, { token: s.priya, raw: PDF, type: "application/pdf" });
  assert.equal(readdirSync(process.env.PRESCRIPTIONS_DIR).length, before + 2);

  const removed = await call("DELETE", `/api/elders/${tempId}/me`, { token: s.priya });
  assert.equal(removed.body.removed, "person");
  assert.equal(readdirSync(process.env.PRESCRIPTIONS_DIR).length, before); // both files are gone
});

test("the leftover-files check lists files that no record points to, and nothing else", () => {
  assert.deepEqual(findLeftovers(db), []);
  writeFileSync(join(process.env.PRESCRIPTIONS_DIR, "lab-99-left-behind.pdf"), "%PDF-1.4 old");
  const found = findLeftovers(db);
  assert.equal(found.length, 1);
  assert.match(found[0], /lab-99-left-behind\.pdf$/);
  rmSync(found[0]);
});
