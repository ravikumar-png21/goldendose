// Automatic tests for the GoldenDose API.  Run with:  npm test
//
// Each test sends real requests to a real (temporary) backend and checks the replies.
// They use a throwaway database in memory and a pretend clock set to 12 October 2026,
// so the results are the same whenever you run them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";
import { checkMissedDoses } from "../src/jobs/missedDoses.js";
import { checkRunningLow } from "../src/jobs/runningLow.js";

process.env.QUIET = "1"; // don't print simulated messages during tests
process.env.PHOTOS_DIR = mkdtempSync(join(tmpdir(), "goldendose-photos-")); // photos go in a throwaway folder

// ---------- Pretend clock (times are Kamala's local time, India) ----------
let current = new Date("2026-10-12T00:00:00+05:30");
clock.now = () => current;
const setTime = (hhmm) => { current = new Date(`2026-10-12T${hhmm}:00+05:30`); };

// ---------- A temporary backend ----------
let server, base, db;

before(async () => {
  db = openDatabase(":memory:");
  server = createApp(db).listen(0); // 0 = any free port
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(process.env.PHOTOS_DIR, { recursive: true, force: true });
});

async function call(method, path, { token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// Shared between tests, which run in order
const s = {};

// ---------- Accounts ----------

test("the backend is alive", async () => {
  const r = await call("GET", "/api/health");
  assert.equal(r.status, 200);
});

test("a caregiver can sign up", async () => {
  const r = await call("POST", "/api/auth/signup", {
    body: { name: "Priya", email: "Priya@Example.com", password: "long-password", phone: "+91 98000 00010" },
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  s.priya = r.body.token;
});

test("the same email can't sign up twice (even in different capitals)", async () => {
  const r = await call("POST", "/api/auth/signup", { body: { name: "P", email: "priya@example.com", password: "long-password" } });
  assert.equal(r.status, 409);
});

test("a short password is refused with a clear message", async () => {
  const r = await call("POST", "/api/auth/signup", { body: { name: "A", email: "a@example.com", password: "short" } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /at least 10/);
});

test("a wrong password is refused without saying which part was wrong", async () => {
  const r = await call("POST", "/api/auth/login", { body: { email: "priya@example.com", password: "wrong-password" } });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "Email or password is wrong.");
});

test("the right password signs in", async () => {
  const r = await call("POST", "/api/auth/login", { body: { email: "priya@example.com", password: "long-password" } });
  assert.equal(r.status, 200);
});

test("no token means no access", async () => {
  const r = await call("GET", "/api/elders");
  assert.equal(r.status, 401);
});

// ---------- Elders and caregivers (many-to-many) ----------

test("Priya adds Kamala and becomes her owner", async () => {
  const r = await call("POST", "/api/elders", { token: s.priya, body: { name: "Kamala", timezone: "Asia/Kolkata" } });
  assert.equal(r.status, 201);
  assert.equal(r.body.role, "owner");
  s.kamalaId = r.body.id;
});

test("Priya can also look after a second elder", async () => {
  const r = await call("POST", "/api/elders", { token: s.priya, body: { name: "Ramesh" } });
  assert.equal(r.status, 201);
  const list = await call("GET", "/api/elders", { token: s.priya });
  assert.deepEqual(list.body.map((e) => e.name), ["Kamala", "Ramesh"]);
});

test("a stranger can't see Kamala's medicines", async () => {
  const signup = await call("POST", "/api/auth/signup", { body: { name: "Arjun", email: "arjun@example.com", password: "long-password" } });
  s.arjun = signup.body.token;
  const r = await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.arjun });
  assert.equal(r.status, 403);
});

test("after Priya invites Arjun, Kamala has two caregivers", async () => {
  const invite = await call("POST", `/api/elders/${s.kamalaId}/caregivers`, { token: s.priya, body: { email: "arjun@example.com" } });
  assert.equal(invite.status, 201);
  const r = await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.arjun });
  assert.equal(r.status, 200);
});

test("a helper can't invite others", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/caregivers`, { token: s.arjun, body: { email: "priya@example.com" } });
  assert.equal(r.status, 403);
});

test("Arjun chooses app notifications only", async () => {
  const r = await call("PUT", `/api/elders/${s.kamalaId}/my-alerts`, { token: s.arjun, body: { sms: false, whatsapp: false, app: true } });
  assert.equal(r.status, 200);
});

// ---------- Medicines ----------

test("a medicine without a name is refused", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { times: ["09:00"] } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Enter the medicine name.");
});

test("a nonsense time is refused", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "X", times: ["27:90"] } });
  assert.equal(r.status, 400);
});

test("Priya adds Amlodipine at 9:00 and Vitamin D at 13:00", async () => {
  const a = await call("POST", `/api/elders/${s.kamalaId}/medicines`, {
    token: s.priya,
    body: { name: "Amlodipine", strength: "5 mg", instruction: "Take one pink tablet", pillShape: "oval", pillColor: "#f4a7b9", times: ["09:00"] },
  });
  assert.equal(a.status, 201);
  assert.equal(a.body.pillColor, "#F4A7B9");
  s.amlodipineSchedule = a.body.schedules[0].id;

  const v = await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Vitamin D3", times: ["13:00"] } });
  s.vitaminSchedule = v.body.schedules[0].id;
});

// ---------- Photos ----------

async function uploadPhoto(medicineId, bytes, type) {
  const response = await fetch(`${base}/api/medicines/${medicineId}/photo`, {
    method: "POST",
    headers: { "Content-Type": type, Authorization: `Bearer ${s.priya}` },
    body: bytes,
  });
  return { status: response.status, body: await response.json() };
}

test("a photo of the pill can be uploaded and then viewed", async () => {
  const meds = await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya });
  s.amlodipineId = meds.body.find((m) => m.name === "Amlodipine").id;
  const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

  const r = await uploadPhoto(s.amlodipineId, fakeJpeg, "image/jpeg");
  assert.equal(r.status, 201);
  assert.match(r.body.photoUrl, /^\/photos\/\d+-[0-9a-f]{24}\.jpg$/);

  const photo = await fetch(base + r.body.photoUrl);
  assert.equal(photo.status, 200);
});

test("a file pretending to be a photo is refused", async () => {
  const r = await uploadPhoto(s.amlodipineId, Buffer.from("this is not a picture"), "image/jpeg");
  assert.equal(r.status, 400);
});

// ---------- Pairing Kamala's phone ----------

test("Kamala's phone pairs with a 6-digit code, which then stops working", async () => {
  const code = await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya });
  assert.equal(code.status, 201);
  assert.match(code.body.code, /^\d{6}$/);

  const pair = await call("POST", "/api/devices/pair", { body: { code: code.body.code, platform: "android" } });
  assert.equal(pair.status, 201);
  assert.equal(pair.body.elder.name, "Kamala");
  s.kamalaPhone = pair.body.deviceToken;

  const again = await call("POST", "/api/devices/pair", { body: { code: code.body.code } });
  assert.equal(again.status, 400);
});

test("a caregiver's token can't be used as Kamala's phone", async () => {
  const r = await call("GET", "/api/today", { token: s.priya });
  assert.equal(r.status, 401);
});

// ---------- Today: taking, double taps, undo ----------

test("Today lists both doses as pending, in time order", async () => {
  setTime("07:30");
  const r = await call("GET", "/api/today", { token: s.kamalaPhone });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.doses.map((d) => [d.time, d.status]), [["09:00", "pending"], ["13:00", "pending"]]);
});

test("a dose can't be marked more than 60 minutes early", async () => {
  setTime("07:30");
  const r = await call("POST", "/api/doses", { token: s.kamalaPhone, body: { scheduleId: s.amlodipineSchedule, status: "taken" } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /too early/);
});

test("Kamala taps Taken at 9:02", async () => {
  setTime("09:02");
  const r = await call("POST", "/api/doses", { token: s.kamalaPhone, body: { scheduleId: s.amlodipineSchedule, status: "taken" } });
  assert.equal(r.status, 201);
  assert.equal(r.body.recordedAt, "09:02");
  s.doseId = r.body.doseId;
});

test("a second tap is refused, so nothing is counted twice", async () => {
  const r = await call("POST", "/api/doses", { token: s.kamalaPhone, body: { scheduleId: s.amlodipineSchedule, status: "taken" } });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "Already marked as taken at 9:02 am.");
});

test("Undo works within 5 minutes", async () => {
  setTime("09:05");
  const r = await call("DELETE", `/api/doses/${s.doseId}`, { token: s.kamalaPhone });
  assert.equal(r.status, 204);
  const today = await call("GET", "/api/today", { token: s.kamalaPhone });
  assert.equal(today.body.doses[0].status, "pending");
});

test("Undo is refused after 5 minutes", async () => {
  setTime("09:06");
  const taken = await call("POST", "/api/doses", { token: s.kamalaPhone, body: { scheduleId: s.amlodipineSchedule, status: "taken" } });
  setTime("09:12");
  const r = await call("DELETE", `/api/doses/${taken.body.doseId}`, { token: s.kamalaPhone });
  assert.equal(r.status, 409);
});

// ---------- Missed doses and caregiver alerts ----------

test("nothing is marked missed before 30 minutes", () => {
  setTime("13:29");
  assert.equal(checkMissedDoses(db), 0);
});

test("at 30 minutes late, the dose is missed and every caregiver is told their way", () => {
  setTime("13:30");
  assert.equal(checkMissedDoses(db), 1);

  const sent = db.prepare("SELECT c.name, n.channel, n.message FROM notifications n JOIN caregivers c ON c.id = n.caregiver_id ORDER BY c.name, n.channel").all();
  // Priya: SMS + WhatsApp + app (the defaults). Arjun: app only (his choice).
  assert.deepEqual(sent.map((n) => `${n.name}:${n.channel}`), ["Arjun:app", "Priya:app", "Priya:sms", "Priya:whatsapp"]);
  assert.equal(sent[0].message, "Kamala hasn't taken Vitamin D3 (due 1:00 pm).");
});

test("the check doesn't alert twice for the same dose", () => {
  setTime("13:31");
  assert.equal(checkMissedDoses(db), 0);
});

test("Kamala can still take it late, and caregivers can see what happened", async () => {
  setTime("13:45");
  const r = await call("POST", "/api/doses", { token: s.kamalaPhone, body: { scheduleId: s.vitaminSchedule, status: "taken" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.late, true);

  const history = await call("GET", `/api/elders/${s.kamalaId}/history?from=2026-10-12&to=2026-10-12`, { token: s.arjun });
  assert.deepEqual(history.body.map((d) => [d.medicine.name, d.status]), [["Amlodipine", "taken"], ["Vitamin D3", "taken"]]);
});

test("a medicine added in the afternoon isn't 'missed' for its morning time", async () => {
  setTime("15:00");
  await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Iron", times: ["08:00"] } });
  setTime("15:01");
  assert.equal(checkMissedDoses(db), 0);
});

test("stopping a medicine removes it from Today but keeps its history", async () => {
  const meds = await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya });
  const amlodipine = meds.body.find((m) => m.name === "Amlodipine");
  const stop = await call("DELETE", `/api/medicines/${amlodipine.id}`, { token: s.priya });
  assert.equal(stop.status, 204);

  const today = await call("GET", "/api/today", { token: s.kamalaPhone });
  assert.ok(!today.body.doses.some((d) => d.medicine.name === "Amlodipine"));
  const history = await call("GET", `/api/elders/${s.kamalaId}/history?from=2026-10-12&to=2026-10-12`, { token: s.priya });
  assert.ok(history.body.some((d) => d.medicine.name === "Amlodipine"));
});

test("broken JSON gets a clear 400, not a crash", async () => {
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(r.status, 400);
});

// ---------- The elder's language, emergency hospital and chemist ----------

const setMoment = (date, hhmm) => { current = new Date(`${date}T${hhmm}:00+05:30`); };

test("the family sets Kamala's language, her hospital and their chemist", async () => {
  const r = await call("PUT", `/api/elders/${s.kamalaId}/profile`, {
    token: s.priya,
    body: { language: "hi", hospital: { name: "City Hospital", phone: "+91 80 2222 3333" }, chemist: { name: "Sharma Medical", phone: "+91 98450 11111" } },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {
    language: "hi", hospital: { name: "City Hospital", phone: "+91 80 2222 3333" },
    chemist: { name: "Sharma Medical", phone: "+91 98450 11111", leadDays: 2 }, requireApproval: false,
  });

  const today = await call("GET", "/api/today", { token: s.kamalaPhone });
  assert.equal(today.body.elder.language, "hi");
  assert.deepEqual(today.body.elder.hospital, { name: "City Hospital", phone: "+91 80 2222 3333" });
});

test("an unknown language or a phone number with letters is refused", async () => {
  const lang = await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.priya, body: { language: "fr" } });
  assert.equal(lang.status, 400);
  const phone = await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.priya, body: { chemist: { phone: "call me" } } });
  assert.equal(phone.status, 400);
});

// ---------- The medicine meter and "running low" ----------

test("Priya counts 20 Telma tablets (twice a day): about 10 days left", async () => {
  setMoment("2026-10-12", "15:00");
  const add = await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Telma", strength: "40", times: ["08:00", "20:00"] } });
  s.telmaId = add.body.id;
  assert.equal(add.body.stock, null); // not counted yet: no meter

  const r = await call("PUT", `/api/medicines/${s.telmaId}/stock`, { token: s.priya, body: { tabletsLeft: 20, perDose: 1 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.stock.tabletsLeft, 20);
  assert.equal(r.body.stock.daysLeft, 10);
  assert.equal(r.body.stock.runningLow, false);
});

test("the meter counts down by the schedule: 3 doses later, about 17 left", async () => {
  setMoment("2026-10-13", "21:00"); // 12th 8 pm, 13th 8 am and 8 pm have passed
  const meds = await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya });
  const telma = meds.body.find((m) => m.name === "Telma");
  assert.equal(telma.stock.tabletsLeft, 17);
  assert.equal(telma.stock.daysLeft, 8);
  assert.equal(checkRunningLow(db), 0);
});

test("with about 5 days left, every caregiver is told once, their way", () => {
  setMoment("2026-10-16", "21:00"); // 9 doses since the count: 11 tablets, 5 days
  assert.equal(checkRunningLow(db), 1);
  const sent = db.prepare(`SELECT c.name, n.channel, n.message FROM other_notifications n JOIN caregivers c ON c.id = n.caregiver_id
                           WHERE n.kind = 'running-low' ORDER BY c.name, n.channel`).all();
  assert.deepEqual(sent.map((n) => `${n.name}:${n.channel}`), ["Arjun:app", "Priya:app", "Priya:sms", "Priya:whatsapp"]);
  assert.equal(sent[0].message, "Kamala's Telma 40 may run out in about 5 days (about 11 tablets left). Time to buy more.");
  assert.equal(checkRunningLow(db), 0); // not again for the same count
});

test("after buying more and counting again, the meter starts fresh", async () => {
  const r = await call("PUT", `/api/medicines/${s.telmaId}/stock`, { token: s.priya, body: { tabletsLeft: 71 } });
  assert.equal(r.body.stock.daysLeft, 35);
  assert.equal(r.body.stock.runningLow, false);
  const bad = await call("PUT", `/api/medicines/${s.telmaId}/stock`, { token: s.priya, body: { tabletsLeft: -3 } });
  assert.equal(bad.status, 400);
});

// ---------- The emergency button ----------

test("the emergency button tells every caregiver on every channel, with a map link", async () => {
  setMoment("2026-10-16", "21:15");
  const r = await call("POST", "/api/emergency", { token: s.kamalaPhone, body: { latitude: 12.9716, longitude: 77.5946 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.caregiversTold, true);
  s.emergencyId = r.body.emergencyId;

  const sent = db.prepare(`SELECT c.name, n.channel, n.message FROM other_notifications n JOIN caregivers c ON c.id = n.caregiver_id
                           WHERE n.kind = 'emergency' ORDER BY c.name, n.channel`).all();
  // Arjun chose "app only" for missed doses, but an emergency reaches him everywhere.
  assert.deepEqual(sent.map((n) => `${n.name}:${n.channel}`), ["Arjun:app", "Arjun:sms", "Arjun:whatsapp", "Priya:app", "Priya:sms", "Priya:whatsapp"]);
  assert.equal(sent[0].message, "EMERGENCY: Kamala pressed the emergency button at 9:15 pm. Call Kamala now. Location: https://maps.google.com/?q=12.9716,77.5946");

  const list = await call("GET", `/api/elders/${s.kamalaId}/emergencies`, { token: s.arjun });
  assert.equal(list.body.length, 1);
  assert.deepEqual(list.body[0].location, { latitude: 12.9716, longitude: 77.5946 });
});

test("\"I'm OK\" after the emergency button tells the family too, once", async () => {
  const ok = await call("POST", `/api/emergency/${s.emergencyId}/ok`, { token: s.kamalaPhone });
  assert.equal(ok.status, 204);
  await call("POST", `/api/emergency/${s.emergencyId}/ok`, { token: s.kamalaPhone });
  const sent = db.prepare("SELECT COUNT(*) AS n FROM other_notifications WHERE kind = 'emergency-cancelled'").get();
  assert.equal(sent.n, 6); // 2 caregivers × 3 channels, not twice
});

test("only the elder's own phone can press the emergency button", async () => {
  const r = await call("POST", "/api/emergency", { token: s.priya });
  assert.equal(r.status, 401);
});
