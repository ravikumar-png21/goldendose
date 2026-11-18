// Tests for doses near midnight, and for catching up after the server was off.
// Before these fixes, a dose due at 11:30 pm or later was never marked missed, Kamala couldn't tap
// Taken for it after midnight, and doses that became late while the server was off were forgotten.
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";
import { checkMissedDoses } from "../src/jobs/missedDoses.js";
import { localToMoment } from "../src/time.js";

process.env.QUIET = "1";

let current = new Date("2026-11-02T10:00:00+05:30");
clock.now = () => current;
const at = (date, hhmm) => { current = new Date(`${date}T${hhmm}:00+05:30`); };

let server, base, db;
before(async () => {
  db = openDatabase(":memory:");
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const s = {};
const doseRows = (name) => db
  .prepare(`SELECT d.date, d.status FROM dose_log d JOIN schedules sc ON sc.id = d.schedule_id JOIN medicines m ON m.id = sc.medicine_id
            WHERE m.name = ? ORDER BY d.date`).all(name).map((r) => `${r.date} ${r.status}`);
const lastAlert = () => db.prepare("SELECT message FROM notifications ORDER BY id DESC LIMIT 1").get()?.message;
const alerts = () => db.prepare("SELECT COUNT(*) AS n FROM notifications").get().n;
const todayDose = async (name) => (await call("GET", "/api/today", { token: s.phone })).body.doses.find((d) => d.medicine.name === name);

test("a wall-clock time becomes the right moment in the elder's timezone", () => {
  assert.equal(localToMoment("2026-10-12", "23:40", "Asia/Kolkata").toISOString(), "2026-10-12T18:10:00.000Z");
  assert.equal(localToMoment("2026-07-01", "09:00", "Europe/London").toISOString(), "2026-07-01T08:00:00.000Z"); // summer time
  assert.equal(localToMoment("2026-01-15", "09:00", "Europe/London").toISOString(), "2026-01-15T09:00:00.000Z");
});

test("setup: Priya, Kamala's phone, and a bedtime tablet at 11:40 pm", async () => {
  s.priya = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.kamalaId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Kamala" } })).body.id;
  const code = (await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya })).body.code;
  s.phone = (await call("POST", "/api/devices/pair", { body: { code } })).body.deviceToken;
  const m = await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Bedtime", times: ["23:40"] } });
  assert.equal(m.status, 201);
  s.bedtimeId = m.body.id;
});

test("the 11:40 pm dose is not missed at 12:05 am (25 minutes late)", () => {
  at("2026-11-02", "23:59");
  assert.equal(checkMissedDoses(db), 0);
  at("2026-11-03", "00:05");
  assert.equal(checkMissedDoses(db), 0);
});

test("after midnight, Today still shows last night's dose, and Kamala can tap Taken for it", async () => {
  const dose = await todayDose("Bedtime");
  assert.equal(dose.carriedOver, true);
  assert.equal(dose.status, "pending");
  const tap = await call("POST", "/api/doses", { token: s.phone, body: { scheduleId: dose.scheduleId, status: "taken" } });
  assert.equal(tap.status, 201);
  assert.deepEqual(doseRows("Bedtime"), ["2026-11-02 taken"]); // saved against the day it was due
  s.doseId = tap.body.doseId;
});

test("Undo works across midnight too", async () => {
  at("2026-11-03", "00:07");
  assert.equal((await call("DELETE", `/api/doses/${s.doseId}`, { token: s.phone })).status, 204);
  assert.deepEqual(doseRows("Bedtime"), []);
});

test("at 12:10 am the 11:40 pm dose is marked missed, and the alert says 'yesterday'", () => {
  at("2026-11-03", "00:10");
  assert.equal(checkMissedDoses(db), 1);
  assert.deepEqual(doseRows("Bedtime"), ["2026-11-02 missed"]);
  assert.equal(lastAlert(), "Kamala hasn't taken Bedtime (due 11:40 pm yesterday).");
});

test("checking again doesn't alert twice", () => {
  const before = alerts();
  at("2026-11-03", "00:11");
  assert.equal(checkMissedDoses(db), 0);
  assert.equal(alerts(), before);
});

test("Kamala can still take it late at 12:20 am: the missed record becomes taken", async () => {
  at("2026-11-03", "00:20");
  const dose = await todayDose("Bedtime");
  assert.equal(dose.carriedOver, true);
  assert.equal(dose.status, "missed");
  const tap = await call("POST", "/api/doses", { token: s.phone, body: { scheduleId: dose.scheduleId, status: "taken" } });
  assert.equal(tap.status, 200);
  assert.equal(tap.body.late, true);
  assert.deepEqual(doseRows("Bedtime"), ["2026-11-02 taken"]);
});

test("once it's marked, Today shows tonight's dose, and that one is too early to tap", async () => {
  const dose = await todayDose("Bedtime");
  assert.equal(dose.carriedOver, false);
  assert.equal(dose.status, "pending");
  const tap = await call("POST", "/api/doses", { token: s.phone, body: { scheduleId: dose.scheduleId, status: "taken" } });
  assert.equal(tap.status, 400);
  assert.match(tap.body.error, /too early/);
});

test("a late tap is allowed for 6 hours only", async () => {
  // Tonight (3 Nov) nobody taps. At 5:30 am it can still be marked; at 5:50 am it can't.
  at("2026-11-04", "05:30");
  checkMissedDoses(db);
  assert.equal((await todayDose("Bedtime")).carriedOver, true);
  at("2026-11-04", "05:50");
  const dose = await todayDose("Bedtime");
  assert.equal(dose.carriedOver, false);
  const tap = await call("POST", "/api/doses", { token: s.phone, body: { scheduleId: dose.scheduleId, status: "taken" } });
  assert.equal(tap.status, 400);
  assert.deepEqual(doseRows("Bedtime"), ["2026-11-02 taken", "2026-11-03 missed"]);
});

test("the server was off from 8 pm to 8 am: the 9 pm dose is still found, and the family is told", async () => {
  at("2026-11-04", "10:00");
  await call("DELETE", `/api/medicines/${s.bedtimeId}`, { token: s.priya });
  await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Evening", times: ["21:00"] } });
  at("2026-11-04", "20:00");
  assert.equal(checkMissedDoses(db), 0);
  at("2026-11-05", "08:00"); // nothing ran in between
  assert.equal(checkMissedDoses(db), 1);
  assert.deepEqual(doseRows("Evening"), ["2026-11-04 missed"]);
  assert.equal(lastAlert(), "Kamala hasn't taken Evening (due 9:00 pm yesterday).");
});

test("after a long break, only the last 48 hours are caught up", () => {
  at("2026-11-09", "08:00"); // off for 4 days: the 5th, 6th, 7th and 8th at 9 pm were all unanswered
  assert.equal(checkMissedDoses(db), 2);
  assert.deepEqual(doseRows("Evening"), ["2026-11-04 missed", "2026-11-07 missed", "2026-11-08 missed"]);
  assert.match(lastAlert(), /due 9:00 pm (yesterday|on Sat,? 7 Nov)/);
});

test("a medicine that was stopped and started again isn't 'missed' for the days it was off", async () => {
  const evening = db.prepare("SELECT id FROM medicines WHERE name = 'Evening'").get().id;
  at("2026-11-09", "09:00");
  await call("DELETE", `/api/medicines/${evening}`, { token: s.priya });       // stopped on the 9th
  at("2026-11-11", "09:00");
  await call("PUT", `/api/medicines/${evening}`, { token: s.priya, body: {} }); // started again on the 11th
  assert.equal(checkMissedDoses(db), 0);                                         // the 9th and 10th at 9 pm don't count
  at("2026-11-11", "21:31");
  assert.equal(checkMissedDoses(db), 1);                                         // tonight's does
  assert.equal(lastAlert(), "Kamala hasn't taken Evening (due 9:00 pm).");
});

test("a dose time that was removed and added back isn't 'missed' for the days it was off", async () => {
  const evening = db.prepare("SELECT id FROM medicines WHERE name = 'Evening'").get().id;
  at("2026-11-12", "09:00");
  await call("PUT", `/api/medicines/${evening}`, { token: s.priya, body: { times: ["21:00", "14:00"] } });
  at("2026-11-12", "15:00");
  checkMissedDoses(db); // the 2 pm dose of the 12th is missed
  await call("PUT", `/api/medicines/${evening}`, { token: s.priya, body: { times: ["21:00"] } });          // 2 pm removed
  at("2026-11-14", "09:00");
  await call("PUT", `/api/medicines/${evening}`, { token: s.priya, body: { times: ["21:00", "14:00"] } }); // 2 pm back
  checkMissedDoses(db);
  const twoPm = db.prepare(`SELECT d.date FROM dose_log d JOIN schedules sc ON sc.id = d.schedule_id
                            WHERE sc.medicine_id = ? AND sc.time_of_day = '14:00' ORDER BY d.date`).all(evening).map((r) => r.date);
  assert.deepEqual(twoPm, ["2026-11-12"]); // not the 13th: the time was switched off that day
  // (the 9 pm time was never switched off, so its unanswered doses of the 12th and 13th are found)
  assert.deepEqual(doseRows("Evening").slice(-2), ["2026-11-12 missed", "2026-11-13 missed"]);
});
