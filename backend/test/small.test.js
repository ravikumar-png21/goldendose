// Tests for the small fixes: spreadsheet cells that look like formulas, dates that don't exist,
// reading times that aren't real times, and wording that fits every elder.
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";
import { csvCell } from "../src/routes/insights.js";
import * as check from "../src/validate.js";

process.env.QUIET = "1";
process.env.GOLDENDOSE_AI = "off";

let current = new Date("2026-11-02T10:00:00+05:30");
clock.now = () => current;

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
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

const s = {};

test("setup: Priya looks after Ramesh", async () => {
  s.priya = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.rameshId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Ramesh" } })).body.id;
});

test("spreadsheet: a cell that starts with = + - or @ gets a ' in front, so Excel shows it as text", () => {
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvCell("+91 98765"), `"'+91 98765"`);
  assert.equal(csvCell("-cmd"), `"'-cmd"`);
  assert.equal(csvCell("@sum"), `"'@sum"`);
  assert.equal(csvCell("Metformin"), `"Metformin"`);
  assert.equal(csvCell(-5), `"-5"`);        // a real number stays a number
  assert.equal(csvCell(null), `""`);
});

test("spreadsheet: the doctor report can't carry a formula in a medicine's name", async () => {
  await call("POST", `/api/elders/${s.rameshId}/medicines`, { token: s.priya, body: { name: "=1+1", times: ["08:00"] } });
  const code = (await call("POST", `/api/elders/${s.rameshId}/pairing-code`, { token: s.priya })).body.code;
  const phone = (await call("POST", "/api/devices/pair", { body: { code } })).body.deviceToken;
  const today = (await call("GET", "/api/today", { token: phone })).body;
  await call("POST", "/api/doses", { token: phone, body: { scheduleId: today.doses[0].scheduleId, status: "taken" } });
  const csv = (await call("GET", `/api/elders/${s.rameshId}/report?from=2026-11-01&to=2026-11-02&format=csv`, { token: s.priya })).body;
  const line = csv.split("\r\n").find((l) => l.includes("1+1"));
  assert.ok(line.startsWith(`"'=1+1"`), line);
});

test("dates: a date that doesn't exist is refused; a real one is accepted", async () => {
  assert.throws(() => check.date("2026-02-30", "report"));
  assert.throws(() => check.date("2026-13-01", "report"));
  assert.throws(() => check.date("12/10/2026", "report"));
  assert.equal(check.date("2028-02-29", "report"), "2028-02-29"); // a leap day
  const bad = await call("GET", `/api/elders/${s.rameshId}/history?from=2026-02-30&to=2026-02-31`, { token: s.priya });
  assert.equal(bad.status, 400);
  const good = await call("GET", `/api/elders/${s.rameshId}/history?from=2026-10-27&to=2026-11-02`, { token: s.priya });
  assert.equal(good.status, 200);
});

test("readings: the time must be a full date and time, not in the future, not older than 5 years", async () => {
  const bp = (takenAt) => call("POST", `/api/elders/${s.rameshId}/bp`, { token: s.priya, body: { systolic: 130, diastolic: 80, ...(takenAt === undefined ? {} : { takenAt }) } });
  assert.equal((await bp("1")).status, 400);                              // used to be saved as 1 January 2001
  assert.equal((await bp("2026-11-02")).status, 400);                     // a date alone isn't a time
  assert.equal((await bp("2026-11-03T10:00:00+05:30")).status, 400);      // tomorrow
  assert.equal((await bp("2019-01-01T10:00:00+05:30")).status, 400);      // too old
  const ok = await bp("2026-11-01T08:30:00+05:30");
  assert.equal(ok.status, 201);
  assert.equal(ok.body.takenAt, "2026-11-01T03:00:00.000Z");
  assert.equal((await bp()).status, 201);                                 // no time sent: now
  const sugar = await call("POST", `/api/elders/${s.rameshId}/readings`, { token: s.priya, body: { kind: "sugar", value: 110, takenAt: "1" } });
  assert.equal(sugar.status, 400);
});

test("Ask: an urgent question about Ramesh says 'the doctor', not 'her doctor'", async () => {
  const r = await call("POST", `/api/elders/${s.rameshId}/ask`, { token: s.priya, body: { question: "He has chest pain" } });
  assert.equal(r.status, 200);
  assert.match(r.body.answer, /call 108 \(ambulance\) or the doctor/);
  assert.doesNotMatch(r.body.answer, /\bher\b/);
});
