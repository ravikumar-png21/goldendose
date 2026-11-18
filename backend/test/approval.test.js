// Tests for approval of how the pill looks. With approval switched on, a helper's change to the pill's
// shape, colour or photo must wait for the main caregiver, like any other change to a medicine.
// (Kamala picks the right tablet by its picture, so a wrong picture is a safety problem.)
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";

process.env.QUIET = "1";
process.env.PHOTOS_DIR = mkdtempSync(join(tmpdir(), "goldendose-photos-"));

const current = new Date("2026-11-02T10:00:00+05:30");
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
  rmSync(process.env.PHOTOS_DIR, { recursive: true, force: true });
});

async function call(method, path, { token, body, raw, type } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(raw ? { "Content-Type": type } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const s = {};

test("setup: Priya (main caregiver), Arjun (helper), Kamala, Metformin, approval switched on", async () => {
  s.priya = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.arjun = (await call("POST", "/api/auth/signup", { body: { name: "Arjun", email: "arjun@example.com", password: "long-password" } })).body.token;
  s.kamalaId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Kamala" } })).body.id;
  await call("POST", `/api/elders/${s.kamalaId}/caregivers`, { token: s.priya, body: { email: "arjun@example.com" } });
  s.metforminId = (await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Metformin", strength: "500 mg", times: ["08:00"] } })).body.id;
  const on = await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.priya, body: { requireApproval: true } });
  assert.equal(on.body.requireApproval, true);
});

test("with approval on, a helper can't change how the pill looks without approval either", async () => {
  // Shape and colour: held for approval, nothing changes yet
  const look = await call("PUT", `/api/medicines/${s.metforminId}`, { token: s.arjun, body: { pillShape: "capsule", pillColor: "#D9534F", pillColor2: "#FFFFFF" } });
  assert.equal(look.status, 202);
  assert.match(look.body.summary, /pill shape round → capsule; pill colour #FFFFFF → #D9534F and #FFFFFF/);
  let now = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.find((m) => m.id === s.metforminId);
  assert.equal(now.pillShape, "round");

  // A new photo: the file is kept, but the medicine has no photo until it's approved
  const photo = await call("POST", `/api/medicines/${s.metforminId}/photo`, { token: s.arjun, raw: PNG, type: "image/png" });
  assert.equal(photo.status, 202);
  now = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.find((m) => m.id === s.metforminId);
  assert.equal(now.photoUrl, null);
  const waiting = (await call("GET", `/api/elders/${s.kamalaId}/pending-changes`, { token: s.priya })).body;
  const photoAsk = waiting.find((w) => w.photoUrl);
  assert.match(photoAsk.summary, /change the photo of Metformin/);
  assert.equal(readdirSync(process.env.PHOTOS_DIR).length, 1);

  // Priya approves the look, and rejects the photo: the look changes, the waiting photo file is removed
  const lookAsk = waiting.find((w) => /pill shape/.test(w.summary));
  assert.equal((await call("POST", `/api/pending-changes/${lookAsk.id}/approve`, { token: s.priya })).status, 200);
  assert.equal((await call("POST", `/api/pending-changes/${photoAsk.id}/reject`, { token: s.priya })).status, 200);
  now = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.find((m) => m.id === s.metforminId);
  assert.equal(now.pillShape, "capsule");
  assert.equal(now.photoUrl, null);
  assert.equal(readdirSync(process.env.PHOTOS_DIR).length, 0);
  const history = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body;
  assert.ok(history.some((h) => /Changed Metformin.*pill shape round → capsule.*\(approved by Priya\)/.test(h.summary)));

  // A second photo, approved this time: it becomes the medicine's photo, and the history says who approved
  const again = await call("POST", `/api/medicines/${s.metforminId}/photo`, { token: s.arjun, raw: PNG, type: "image/png" });
  assert.equal((await call("POST", `/api/pending-changes/${again.body.pendingId}/approve`, { token: s.priya })).status, 200);
  now = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.find((m) => m.id === s.metforminId);
  assert.match(now.photoUrl, /^\/photos\//);
  assert.equal((await fetch(base + now.photoUrl)).status, 200);

  // The main caregiver's own changes still apply at once, and are written in the history
  const mine = await call("PUT", `/api/medicines/${s.metforminId}`, { token: s.priya, body: { pillShape: "round", pillColor2: null } });
  assert.equal(mine.status, 200);
  const latest = (await call("GET", `/api/elders/${s.kamalaId}/changes?limit=1`, { token: s.priya })).body[0];
  assert.match(latest.summary, /pill shape capsule → round/);
});
