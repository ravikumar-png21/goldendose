// Tests for the limits on wrong tries (the pairing code, passwords) and on repeated emergency presses.
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";

process.env.QUIET = "1";

let current = new Date("2026-11-02T10:00:00+05:30");
clock.now = () => current;
const minutesLater = (n) => { current = new Date(current.getTime() + n * 60_000); };

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
const wrongCode = (real) => (real === "000000" ? "000001" : "000000");

test("setup: Priya and Kamala", async () => {
  s.priya = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.kamalaId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Kamala" } })).body.id;
});

test("a pairing code lasts 10 minutes", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya });
  assert.equal(new Date(r.body.expiresAt) - current, 10 * 60_000);
  s.code = r.body.code;
});

test("5 wrong pairing codes are answered normally; the 6th try is refused, even with the right code", async () => {
  for (let i = 0; i < 5; i++) {
    assert.equal((await call("POST", "/api/devices/pair", { body: { code: wrongCode(s.code) } })).status, 400);
  }
  const blocked = await call("POST", "/api/devices/pair", { body: { code: s.code } });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many tries/);
});

test("after 15 minutes the wait is over, and a new code pairs the phone", async () => {
  minutesLater(16);
  const fresh = (await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya })).body.code;
  const r = await call("POST", "/api/devices/pair", { body: { code: fresh } });
  assert.equal(r.status, 201);
  s.phone = r.body.deviceToken;
});

test("too many wrong codes from everyone together pause pairing for everyone", async () => {
  minutesLater(20);
  const add = db.prepare("INSERT INTO failed_attempts (kind, who, at) VALUES ('pair', ?, ?)");
  for (let i = 0; i < 50; i++) add.run(`10.0.0.${i}`, current.toISOString()); // 50 different addresses, one wrong try each
  const code = (await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya })).body.code;
  assert.equal((await call("POST", "/api/devices/pair", { body: { code } })).status, 429);
  minutesLater(11);
  assert.equal((await call("POST", "/api/devices/pair", { body: { code: wrongCode(code) } })).status, 400); // open again
});

test("5 wrong passwords are answered normally; the 6th try is refused, even with the right password", async () => {
  minutesLater(60);
  for (let i = 0; i < 5; i++) {
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "priya@example.com", password: `wrong-password-${i}` } })).status, 401);
  }
  const blocked = await call("POST", "/api/auth/login", { body: { email: "priya@example.com", password: "long-password" } });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many wrong tries/);
});

test("after 15 minutes the right password works again, and a correct sign-in clears the count", async () => {
  minutesLater(16);
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "priya@example.com", password: "long-password" } })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failed_attempts WHERE kind = 'login'").get().n, 0);
});

test("passwords must be at least 10 characters and not a common one", async () => {
  const short = await call("POST", "/api/auth/signup", { body: { name: "A", email: "a@example.com", password: "ninechars" } });
  assert.equal(short.status, 400);
  const common = await call("POST", "/api/auth/signup", { body: { name: "A", email: "a@example.com", password: "Password123" } });
  assert.equal(common.status, 400);
  assert.match(common.body.error, /too easy to guess/);
});

test("a phone number at sign-up must look like a phone number", async () => {
  const bad = await call("POST", "/api/auth/signup", { body: { name: "A", email: "a@example.com", password: "long-password", phone: "<b>not a phone</b>" } });
  assert.equal(bad.status, 400);
  const good = await call("POST", "/api/auth/signup", { body: { name: "A", email: "a@example.com", password: "long-password", phone: "+91 98000 00030" } });
  assert.equal(good.status, 201);
});

test("emergency presses within 5 minutes count as one emergency: the family is told once", async () => {
  minutesLater(60);
  const first = await call("POST", "/api/emergency", { token: s.phone, body: {} });
  assert.equal(first.status, 201);
  const told = db.prepare("SELECT COUNT(*) AS n FROM other_notifications WHERE kind = 'emergency'").get().n;
  assert.ok(told > 0);
  for (let i = 0; i < 9; i++) {
    const again = await call("POST", "/api/emergency", { token: s.phone, body: { latitude: 12.97, longitude: 77.59 } });
    assert.equal(again.body.emergencyId, first.body.emergencyId);
    assert.equal(again.body.repeated, true);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM other_notifications WHERE kind = 'emergency'").get().n, told);
  const row = db.prepare("SELECT presses, latitude FROM emergencies WHERE id = ?").get(first.body.emergencyId);
  assert.equal(row.presses, 10);
  assert.equal(row.latitude, 12.97); // a later press can add the location the first one lacked
});

test("after \"I'm OK\", or after 5 minutes, a new press is a new emergency", async () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM emergencies").get().n;
  minutesLater(6);
  const later = await call("POST", "/api/emergency", { token: s.phone, body: {} });
  assert.equal(later.body.repeated, undefined);
  await call("POST", `/api/emergency/${later.body.emergencyId}/ok`, { token: s.phone });
  const afterOk = await call("POST", "/api/emergency", { token: s.phone, body: {} });
  assert.notEqual(afterOk.body.emergencyId, later.body.emergencyId);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM emergencies").get().n, before + 2);
});
