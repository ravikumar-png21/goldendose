// Tests for taps made without internet. The phone keeps the tap and sends it later with the time
// it was really made, so the record (and the family) get the truth.
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";
import { checkMissedDoses } from "../src/jobs/missedDoses.js";

process.env.QUIET = "1";

let current = new Date("2026-11-02T10:00:00+05:30");
clock.now = () => current;
const at = (date, hhmm) => { current = new Date(`${date}T${hhmm}:00+05:30`); };
const moment = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

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
const record = (scheduleId) => db.prepare("SELECT date, status, recorded_at FROM dose_log WHERE schedule_id = ? ORDER BY date").all(scheduleId).map((r) => ({ ...r }));
const tap = (scheduleId, tappedAt) => call("POST", "/api/doses", { token: s.phone, body: { scheduleId, status: "taken", ...(tappedAt === undefined ? {} : { tappedAt }) } });

test("setup: Kamala's phone, an 8 pm tablet and an 11:40 pm tablet", async () => {
  s.priya = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.kamalaId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Kamala" } })).body.id;
  const code = (await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya })).body.code;
  s.phone = (await call("POST", "/api/devices/pair", { body: { code } })).body.deviceToken;
  const add = async (name, time) => (await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name, times: [time] } })).body.schedules[0].id;
  s.evening = await add("Evening", "20:00");
  s.bedtime = await add("Bedtime", "23:40");
});

test("tapped offline at 8:05 pm, sent at 8:50 pm after the family was told 'missed': the record says 8:05 pm, and the family is told", async () => {
  at("2026-11-02", "20:31");
  assert.equal(checkMissedDoses(db), 1); // the phone was offline, so the backend thinks it was missed
  at("2026-11-02", "20:50");
  const r = await tap(s.evening, moment("2026-11-02", "20:05"));
  assert.equal(r.status, 200);
  assert.equal(r.body.recordedAt, "20:05");
  assert.deepEqual(record(s.evening), [{ date: "2026-11-02", status: "taken", recorded_at: moment("2026-11-02", "20:05") }]);
  const told = db.prepare("SELECT message FROM other_notifications WHERE kind = 'taken-offline'").all();
  assert.ok(told.length >= 1);
  assert.equal(told[0].message, "Kamala did take Evening (at 8:05 pm). The phone was offline, so GoldenDose only heard now.");
});

test("tapped offline at 11:50 pm, sent at 12:20 am: saved against the right day, with the real time", async () => {
  at("2026-11-03", "00:20");
  const r = await tap(s.bedtime, moment("2026-11-02", "23:50"));
  assert.equal(r.status, 201);
  assert.deepEqual(record(s.bedtime), [{ date: "2026-11-02", status: "taken", recorded_at: moment("2026-11-02", "23:50") }]);
  assert.equal(checkMissedDoses(db), 0); // nothing left to mark missed
});

test("an ordinary late tap (no offline time) doesn't send the 'phone was offline' message", async () => {
  at("2026-11-03", "20:31");
  checkMissedDoses(db);
  const before = db.prepare("SELECT COUNT(*) AS n FROM other_notifications WHERE kind = 'taken-offline'").get().n;
  at("2026-11-03", "20:45");
  assert.equal((await tap(s.evening)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM other_notifications WHERE kind = 'taken-offline'").get().n, before);
});

test("a phone whose clock runs ahead: the arrival time is used instead", async () => {
  at("2026-11-03", "23:45");
  const r = await tap(s.bedtime, moment("2026-11-04", "03:00")); // "3 am tomorrow", says the phone
  assert.equal(r.status, 201);
  assert.equal(record(s.bedtime).at(-1).recorded_at, moment("2026-11-03", "23:45"));
});

test("a tap older than 24 hours, or with a nonsense time, is refused", async () => {
  at("2026-11-05", "21:00");
  assert.equal((await tap(s.evening, moment("2026-11-04", "20:05"))).status, 400);
  assert.equal((await tap(s.evening, "yesterday evening")).status, 400);
  assert.equal((await tap(s.evening, 12345)).status, 400);
});
