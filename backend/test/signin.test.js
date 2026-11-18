// Tests for how long a sign-in lasts, changing a password, and signing out everywhere.
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";

process.env.QUIET = "1";

let current = new Date("2026-11-02T10:00:00+05:30");
clock.now = () => current;
const daysLater = (n) => { current = new Date(current.getTime() + n * 86_400_000); };

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
const signIn = async (password = "long-password") => (await call("POST", "/api/auth/login", { body: { email: "priya@example.com", password } }));
const me = (token) => call("GET", "/api/me", { token });

const s = {};

test("setup: Priya signs up and connects Kamala's phone", async () => {
  s.laptop = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.kamalaId = (await call("POST", "/api/elders", { token: s.laptop, body: { name: "Kamala" } })).body.id;
  const code = (await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.laptop })).body.code;
  s.kamalaPhone = (await call("POST", "/api/devices/pair", { body: { code } })).body.deviceToken;
});

test("using the app keeps a family member signed in: each use moves the 30 days forward", async () => {
  daysLater(29);
  assert.equal((await me(s.laptop)).status, 200); // day 29: still fine, and this use renews it
  daysLater(29);
  assert.equal((await me(s.laptop)).status, 200); // day 58: fine, because it was used on day 29
});

test("a sign-in not used for more than 30 days stops working, and is forgotten", async () => {
  s.phone = (await signIn()).body.token; // Priya also signs in on her phone, then never opens it there again
  daysLater(20);
  assert.equal((await me(s.laptop)).status, 200);
  daysLater(11);                          // the phone: 31 days unused. The laptop: 11 days.
  assert.equal((await me(s.phone)).status, 401);
  assert.equal((await me(s.laptop)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM devices WHERE caregiver_id IS NOT NULL").get().n, 1);
});

test("Kamala's phone stays connected for a year without use, not longer", async () => {
  // It was connected at the start and never used since: 89 days so far.
  daysLater(270);
  assert.equal((await call("GET", "/api/today", { token: s.kamalaPhone })).status, 200); // day 359: fine, and renewed
  daysLater(366);
  assert.equal((await call("GET", "/api/today", { token: s.kamalaPhone })).status, 401); // a year and a day unused
});

test("a sign-in from before this rule existed (no end date) still works, and gets an end date on first use", async () => {
  assert.equal((await me(s.laptop)).status, 401); // the laptop wasn't used for over a year either: forgotten
  s.laptop = (await signIn()).body.token;
  db.prepare("UPDATE devices SET expires_at = NULL").run();
  assert.equal((await me(s.laptop)).status, 200);
  assert.ok(db.prepare("SELECT expires_at FROM devices").get().expires_at > current.toISOString());
});

test("changing the password needs the current one, and a good new one", async () => {
  s.phone = (await signIn()).body.token;
  const change = (body) => call("POST", "/api/auth/password", { token: s.laptop, body });
  assert.equal((await call("POST", "/api/auth/password", { body: { currentPassword: "long-password", newPassword: "a-new-password" } })).status, 401);
  const wrong = await change({ currentPassword: "not-my-password", newPassword: "a-new-password" });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /current password is wrong/);
  assert.equal((await change({ currentPassword: "long-password", newPassword: "short" })).status, 400);
  assert.equal((await change({ currentPassword: "long-password", newPassword: "long-password" })).status, 400);
});

test("after a password change, this device stays signed in and every other one is signed out", async () => {
  const r = await call("POST", "/api/auth/password", { token: s.laptop, body: { currentPassword: "long-password", newPassword: "a-new-password" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.signedOutOthers, 1);
  assert.equal((await me(s.laptop)).status, 200);
  assert.equal((await me(s.phone)).status, 401);
  assert.equal((await signIn("long-password")).status, 401); // the old password no longer works
  assert.equal((await signIn("a-new-password")).status, 200);
});

test("sign out everywhere ends every sign-in, this one too", async () => {
  s.phone = (await signIn("a-new-password")).body.token;
  const r = await call("POST", "/api/auth/logout-everywhere", { token: s.laptop });
  assert.equal(r.status, 200);
  assert.ok(r.body.signedOut >= 2);
  assert.equal((await me(s.laptop)).status, 401);
  assert.equal((await me(s.phone)).status, 401);
});
