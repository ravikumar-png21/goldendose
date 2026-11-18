// Tests for the family features added on 21 October 2026:
// what each medicine is for, prescriptions, the change history, approval of helpers' changes,
// the smarter medicine meter, patterns, the "Needs attention" list, the setup check,
// the doctor visit report, and "Ask GoldenDose" (its simple answers; the AI is switched off in tests).
//
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { clock } from "../src/clock.js";
import { checkMissedDoses } from "../src/jobs/missedDoses.js";
import { checkRunningLow } from "../src/jobs/runningLow.js";
import { checkPatterns } from "../src/insights.js";
import { messageCaregivers } from "../src/notify.js";
import { lookUpMedicine } from "../src/medicine-info.js";

process.env.QUIET = "1";
process.env.GOLDENDOSE_AI = "off"; // never call the real AI from tests
process.env.PHOTOS_DIR = mkdtempSync(join(tmpdir(), "goldendose-photos-"));
process.env.PRESCRIPTIONS_DIR = mkdtempSync(join(tmpdir(), "goldendose-prescriptions-"));

let current = new Date("2026-10-21T09:00:00+05:30");
clock.now = () => current;
const setMoment = (date, hhmm) => { current = new Date(`${date}T${hhmm}:00+05:30`); };

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
  rmSync(process.env.PRESCRIPTIONS_DIR, { recursive: true, force: true });
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
  const isJson = (response.headers.get("content-type") ?? "").includes("json");
  return { status: response.status, body: text && isJson ? JSON.parse(text) : text, headers: response.headers };
}

const s = {};

test("setup: Priya (main caregiver), Arjun (helper) and Kamala", async () => {
  s.priya = (await call("POST", "/api/auth/signup", { body: { name: "Priya", email: "priya@example.com", password: "long-password" } })).body.token;
  s.arjun = (await call("POST", "/api/auth/signup", { body: { name: "Arjun", email: "arjun@example.com", password: "long-password" } })).body.token;
  s.stranger = (await call("POST", "/api/auth/signup", { body: { name: "Stranger", email: "x@example.com", password: "long-password" } })).body.token;
  s.kamalaId = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Kamala" } })).body.id;
  const invite = await call("POST", `/api/elders/${s.kamalaId}/caregivers`, { token: s.priya, body: { email: "arjun@example.com" } });
  assert.equal(invite.status, 201);
});

// ---------- What each medicine is for ----------

test("medicine info: brand names and generics are recognised, with the strength ignored", () => {
  assert.equal(lookUpMedicine("Glycomet 500").usedFor, "Diabetes (blood sugar)");
  assert.equal(lookUpMedicine("Telma-40").generic, "Telmisartan");
  assert.equal(lookUpMedicine("Telma H").generic, "Telmisartan + Hydrochlorothiazide");
  assert.equal(lookUpMedicine("Thyronorm 50 mcg").usedFor, "Underactive thyroid (hypothyroidism)");
  assert.equal(lookUpMedicine("Panadol"), null);  // "Pan" must not match a longer word
  assert.equal(lookUpMedicine("ab"), null);
});

test("medicine info is available to signed-in family members, with a not-medical-advice note", async () => {
  const r = await call("GET", "/api/medicine-info?name=Metformin%20500", { token: s.priya });
  assert.equal(r.status, 200);
  assert.equal(r.body.usedFor, "Diabetes (blood sugar)");
  assert.match(r.body.note, /not medical advice/);
  assert.equal((await call("GET", "/api/medicine-info?name=Metformin")).status, 401);
});

test("a medicine is saved with what it's for, and the change history says who added it", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/medicines`, {
    token: s.priya,
    body: { name: "Metformin", strength: "500 mg", purpose: "Diabetes (blood sugar)", times: ["08:00", "20:00"], reason: "New prescription" },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.purpose, "Diabetes (blood sugar)");
  assert.equal(r.body.hardToGet, false);
  s.metforminId = r.body.id;

  const history = await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.arjun });
  assert.equal(history.body[0].who, "Priya");
  assert.equal(history.body[0].action, "added");
  assert.match(history.body[0].summary, /Added Metformin 500 mg at 8:00 am, 8:00 pm \(for Diabetes/);
  assert.equal(history.body[0].reason, "New prescription");
});

test("Kamala's app shows what each medicine is for", async () => {
  const code = await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya });
  const pair = await call("POST", "/api/devices/pair", { body: { code: code.body.code } });
  s.kamalaPhone = pair.body.deviceToken;
  const today = await call("GET", "/api/today", { token: s.kamalaPhone });
  assert.equal(today.body.doses[0].medicine.purpose, "Diabetes (blood sugar)");
  assert.deepEqual(today.body.elder.family, ["Priya", "Arjun"]); // "Connected to your family: Priya, Arjun"
});

test("a phone can disconnect itself, and its token stops working", async () => {
  const code = await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya });
  const spare = (await call("POST", "/api/devices/pair", { body: { code: code.body.code } })).body.deviceToken;
  assert.equal((await call("DELETE", "/api/devices/me", { token: spare })).status, 204);
  assert.equal((await call("GET", "/api/today", { token: spare })).status, 401);
  assert.equal((await call("GET", "/api/today", { token: s.kamalaPhone })).status, 200); // Kamala's own phone is unaffected
});

test("Disconnect this phone: the family disconnects Kamala's phone, and it can be connected again", async () => {
  const code = await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya });
  const lost = (await call("POST", "/api/devices/pair", { body: { code: code.body.code } })).body.deviceToken;
  assert.equal((await call("DELETE", `/api/elders/${s.kamalaId}/devices`, { token: s.stranger })).status, 403);

  const r = await call("DELETE", `/api/elders/${s.kamalaId}/devices`, { token: s.arjun }); // helpers can, too
  assert.equal(r.status, 200);
  assert.equal(r.body.disconnected, 2); // Kamala's phone and the "lost" one
  assert.equal((await call("GET", "/api/today", { token: lost })).status, 401);
  assert.equal((await call("GET", "/api/today", { token: s.kamalaPhone })).status, 401);
  const [latest] = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body;
  assert.equal(latest.summary, "Disconnected Kamala's phone");
  assert.equal(latest.who, "Arjun");
  const checkup = (await call("GET", `/api/elders/${s.kamalaId}/checkup`, { token: s.priya })).body;
  assert.equal(checkup.items.find((i) => i.key === "phone").ok, false);

  // Connect Kamala's phone again, so the tests below can use it
  const again = await call("POST", `/api/elders/${s.kamalaId}/pairing-code`, { token: s.priya });
  s.kamalaPhone = (await call("POST", "/api/devices/pair", { body: { code: again.body.code } })).body.deviceToken;
  assert.equal((await call("GET", "/api/today", { token: s.kamalaPhone })).status, 200);
});

test("the address for another phone on the same Wi-Fi", async () => {
  const r = await call("GET", "/api/address");
  assert.equal(r.status, 200);
  assert.ok(r.body.wifi === null || /^http:\/\/[\d.]+:\d+$/.test(r.body.wifi), r.body.wifi);
});

// ---------- The change history ----------

test("changing a medicine records exactly what changed, by whom and why", async () => {
  setMoment("2026-10-21", "09:30");
  const r = await call("PUT", `/api/medicines/${s.metforminId}`, { token: s.arjun, body: { times: ["09:00", "20:00"], reason: "Doctor moved it after breakfast" } });
  assert.equal(r.status, 200);
  const [latest] = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body;
  assert.equal(latest.who, "Arjun");
  assert.equal(latest.summary, "Changed Metformin 500 mg: times 8:00 am, 8:00 pm → 9:00 am, 8:00 pm");
  assert.equal(latest.reason, "Doctor moved it after breakfast");
});

test("saving without any real change adds nothing to the history", async () => {
  const before = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body.length;
  await call("PUT", `/api/medicines/${s.metforminId}`, { token: s.priya, body: { name: "Metformin" } });
  const after = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body.length;
  assert.equal(after, before);
});

test("the medicine list on a past date shows the times as they were then", async () => {
  const then = await call("GET", `/api/elders/${s.kamalaId}/medicines-on?date=2026-10-21`, { token: s.priya });
  assert.deepEqual(then.body.medicines.map((m) => [m.name, m.times]), [["Metformin", ["09:00", "20:00"]]]);
  const before = await call("GET", `/api/elders/${s.kamalaId}/medicines-on?date=2026-10-20`, { token: s.priya });
  assert.deepEqual(before.body.medicines, []); // it was added on the 21st
  assert.equal((await call("GET", `/api/elders/${s.kamalaId}/medicines-on?date=2030-01-01`, { token: s.priya })).status, 400);
});

test("a stranger can't read Kamala's change history", async () => {
  assert.equal((await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.stranger })).status, 403);
});

// ---------- Approval of helpers' changes ----------

test("only the main caregiver can switch on approval", async () => {
  const helper = await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.arjun, body: { requireApproval: true } });
  assert.equal(helper.status, 403);
  const owner = await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.priya, body: { requireApproval: true } });
  assert.equal(owner.status, 200);
  assert.equal(owner.body.requireApproval, true);
});

test("with approval on, a helper's change waits, and the main caregiver is told", async () => {
  const r = await call("PUT", `/api/medicines/${s.metforminId}`, { token: s.arjun, body: { strength: "1000 mg", reason: "Doctor increased it" } });
  assert.equal(r.status, 202);
  assert.equal(r.body.pending, true);
  s.pendingId = r.body.pendingId;

  const medicine = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body[0];
  assert.equal(medicine.strength, "500 mg"); // not changed yet

  const told = db.prepare("SELECT c.name FROM other_notifications n JOIN caregivers c ON c.id = n.caregiver_id WHERE n.kind = 'approval-needed'").all();
  assert.ok(told.length > 0);
  assert.ok(told.every((t) => t.name === "Priya")); // only the main caregiver

  const attention = (await call("GET", "/api/attention", { token: s.priya })).body;
  assert.ok(attention.some((a) => a.kind === "approval" && /Arjun wants to change Metformin 500 mg: strength 500 mg → 1000 mg/.test(a.title)));
});

test("a helper can't approve, and the main caregiver's approval applies the change", async () => {
  assert.equal((await call("POST", `/api/pending-changes/${s.pendingId}/approve`, { token: s.arjun })).status, 403);
  const r = await call("POST", `/api/pending-changes/${s.pendingId}/approve`, { token: s.priya });
  assert.equal(r.status, 200);
  const medicine = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body[0];
  assert.equal(medicine.strength, "1000 mg");
  const [latest] = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body;
  assert.equal(latest.who, "Arjun");
  assert.equal(latest.summary, "Changed Metformin 500 mg: strength 500 mg → 1000 mg (approved by Priya)");
  assert.equal((await call("POST", `/api/pending-changes/${s.pendingId}/approve`, { token: s.priya })).status, 409);
});

test("a rejected addition never becomes a medicine", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.arjun, body: { name: "Dolo", strength: "650", times: ["14:00"] } });
  assert.equal(r.status, 202);
  await call("POST", `/api/pending-changes/${r.body.pendingId}/reject`, { token: s.priya });
  const names = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.map((m) => m.name);
  assert.deepEqual(names, ["Metformin"]);
  const [latest] = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body;
  assert.equal(latest.action, "rejected");
});

test("the main caregiver's own changes don't wait", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya, body: { name: "Telma", strength: "40", purpose: "High blood pressure", times: ["21:00"] } });
  assert.equal(r.status, 201);
  s.telmaId = r.body.id;
  await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.priya, body: { requireApproval: false } });
});

// ---------- Prescriptions ----------

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

test("a prescription photo or PDF can be uploaded and described", async () => {
  const photo = await call("POST", `/api/elders/${s.kamalaId}/prescriptions`, { token: s.arjun, raw: PNG, type: "image/png" });
  assert.equal(photo.status, 201);
  assert.equal(photo.body.kind, "png");
  assert.equal(photo.body.uploadedBy, "Arjun");
  const pdf = await call("POST", `/api/elders/${s.kamalaId}/prescriptions`, { token: s.priya, raw: PDF, type: "application/pdf" });
  assert.equal(pdf.body.kind, "pdf");
  s.prescriptionId = pdf.body.id;

  const put = await call("PUT", `/api/prescriptions/${s.prescriptionId}`, { token: s.priya, body: { doctor: "Dr. Rao", issuedOn: "2026-10-03", note: "Sugar review" } });
  assert.equal(put.body.doctor, "Dr. Rao");
  const list = (await call("GET", `/api/elders/${s.kamalaId}/prescriptions`, { token: s.priya })).body;
  assert.equal(list.length, 2);
});

test("a prescription file opens only for Kamala's family", async () => {
  const mine = await call("GET", `/api/prescriptions/${s.prescriptionId}/file`, { token: s.arjun });
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get("content-type"), "application/pdf");
  assert.match(mine.headers.get("cache-control"), /no-store/);
  assert.equal((await call("GET", `/api/prescriptions/${s.prescriptionId}/file`, { token: s.stranger })).status, 403);
  assert.equal((await call("GET", `/api/prescriptions/${s.prescriptionId}/file`)).status, 401);
});

test("a file that isn't a photo or PDF is refused", async () => {
  const r = await call("POST", `/api/elders/${s.kamalaId}/prescriptions`, { token: s.priya, raw: Buffer.from("not really a pdf"), type: "application/pdf" });
  assert.equal(r.status, 400);
});

test("deleting a prescription removes its file too", async () => {
  const before = readdirSync(process.env.PRESCRIPTIONS_DIR).length;
  assert.equal((await call("DELETE", `/api/prescriptions/${s.prescriptionId}`, { token: s.priya })).status, 204);
  assert.equal(readdirSync(process.env.PRESCRIPTIONS_DIR).length, before - 1);
  const [latest] = (await call("GET", `/api/elders/${s.kamalaId}/changes`, { token: s.priya })).body;
  assert.match(latest.summary, /Removed a prescription from Dr. Rao dated 2026-10-03/);
});

// ---------- The smarter medicine meter ----------

test("the meter warns 5 days ahead by default, and says when to order by", async () => {
  setMoment("2026-10-21", "10:00");
  const r = await call("PUT", `/api/medicines/${s.telmaId}/stock`, { token: s.priya, body: { tabletsLeft: 8, perDose: 1 } });
  assert.equal(r.body.stock.daysLeft, 8);
  assert.equal(r.body.stock.orderAheadDays, 5);
  assert.equal(r.body.stock.orderBy, "2026-10-24");
  assert.equal(r.body.stock.runningLow, false);
});

test("a chemist who needs longer, or a hard-to-get medicine, makes the warning come earlier", async () => {
  await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.priya, body: { chemist: { leadDays: 4 } } });
  let telma = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.find((m) => m.id === s.telmaId);
  assert.equal(telma.stock.orderAheadDays, 7);
  assert.equal(telma.stock.runningLow, false);

  await call("PUT", `/api/medicines/${s.telmaId}`, { token: s.priya, body: { hardToGet: true } });
  telma = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.find((m) => m.id === s.telmaId);
  assert.equal(telma.stock.orderAheadDays, 14);
  assert.equal(telma.stock.runningLow, true);
  assert.equal(telma.stock.orderBy, "2026-10-21"); // today
  assert.equal(checkRunningLow(db), 1);
  await call("PUT", `/api/elders/${s.kamalaId}/profile`, { token: s.priya, body: { chemist: { leadDays: 2 } } });
  await call("PUT", `/api/medicines/${s.telmaId}`, { token: s.priya, body: { hardToGet: false } });
});

test("a dose Kamala skipped doesn't use up a tablet", async () => {
  setMoment("2026-10-21", "21:05");
  const today = await call("GET", "/api/today", { token: s.kamalaPhone });
  const telmaDose = today.body.doses.find((d) => d.medicine.name === "Telma");
  await call("POST", "/api/doses", { token: s.kamalaPhone, body: { scheduleId: telmaDose.scheduleId, status: "skipped" } });
  const telma = (await call("GET", `/api/elders/${s.kamalaId}/medicines`, { token: s.priya })).body.find((m) => m.id === s.telmaId);
  assert.equal(telma.stock.tabletsLeft, 8); // the 9 pm dose passed, but was skipped
});

// ---------- Patterns, Needs attention, setup check ----------

// Fills in Metformin's 9 am record for each of the last 28 days.
function history(make) {
  const schedule = db.prepare("SELECT id FROM schedules WHERE medicine_id = ? AND time_of_day = '09:00' AND active = 1").get(s.metforminId);
  const save = db.prepare("INSERT OR REPLACE INTO dose_log (schedule_id, date, status, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?)");
  for (let back = 27; back >= 1; back--) {
    const d = new Date(Date.parse("2026-10-21T00:00:00Z") - back * 86_400_000).toISOString().slice(0, 10);
    const { status, at } = make(back);
    save.run(schedule.id, d, status, new Date(`${d}T${at}:00+05:30`).toISOString(), status === "missed" ? "system" : "elder");
  }
}

test("patterns: more missed doses than usual, and one dose time missed again and again", async () => {
  history((back) => (back <= 6 && back % 2 === 0 ? { status: "missed", at: "09:30" } : { status: "taken", at: "09:05" }));
  // 3 misses in the last 7 days (6, 4 and 2 days ago); none in the 3 weeks before.
  const elder = db.prepare("SELECT id, name, timezone FROM elders WHERE id = ?").get(s.kamalaId);
  setMoment("2026-10-21", "08:00");
  const { patternsFor } = await import("../src/insights.js");
  const found = patternsFor(db, elder);
  assert.ok(found.some((p) => p.key === "missed-more" && /missed 3 doses in the last 7 days, usually almost none/.test(p.message)));
  assert.ok(found.some((p) => p.key === "time-09:00" && /9:00 am dose was missed on 3 of the last 7 days/.test(p.message)));
});

test("patterns: when most dose times are missed, one message says so instead of one per time", async () => {
  const elder = db.prepare("SELECT id, name, timezone FROM elders WHERE id = ?").get(s.kamalaId);
  const { patternsFor } = await import("../src/insights.js");
  // Mark every dose of the last 6 days missed: 9 am, 8 pm (Metformin) and 9 pm (Telma)
  const save = db.prepare("INSERT OR REPLACE INTO dose_log (schedule_id, date, status, recorded_at, recorded_by) VALUES (?, ?, 'missed', ?, 'system')");
  const schedules = db.prepare("SELECT s.id FROM schedules s JOIN medicines m ON m.id = s.medicine_id WHERE m.elder_id = ? AND s.active = 1").all(s.kamalaId);
  const backup = db.prepare("SELECT * FROM dose_log").all();
  for (let back = 1; back <= 6; back++) {
    const d = new Date(Date.parse("2026-10-21T00:00:00Z") - back * 86_400_000).toISOString().slice(0, 10);
    for (const sc of schedules) save.run(sc.id, d, `${d}T12:00:00Z`);
  }
  const found = patternsFor(db, elder);
  assert.ok(found.some((p) => p.key === "missed-more"));
  assert.ok(!found.some((p) => p.key.startsWith("time-")));
  // put the records back as they were
  db.prepare("DELETE FROM dose_log").run();
  const restore = db.prepare("INSERT INTO dose_log (id, schedule_id, date, status, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?)");
  for (const r of backup) restore.run(r.id, r.schedule_id, r.date, r.status, r.recorded_at, r.recorded_by);
});

test("patterns are told to the family once, not every hour", () => {
  const first = checkPatterns(db, messageCaregivers);
  assert.ok(first >= 2);
  assert.equal(checkPatterns(db, messageCaregivers), 0);
  const sent = db.prepare("SELECT message FROM other_notifications WHERE kind = 'pattern'").all();
  assert.ok(sent.some((m) => /GoldenDose noticed: Kamala missed 3 doses/.test(m.message)));
});

test("patterns: taking a dose later and later", async () => {
  history((back) => (back <= 6 ? { status: "taken", at: "10:15" } : { status: "taken", at: "09:05" }));
  const elder = db.prepare("SELECT id, name, timezone FROM elders WHERE id = ?").get(s.kamalaId);
  const { patternsFor } = await import("../src/insights.js");
  const later = patternsFor(db, elder).find((p) => p.key === "later-09:00");
  assert.match(later.message, /taking the 9:00 am dose later than before: about 75 minutes late this week, on time before/);
});

test("Needs attention: an emergency comes first, then missed doses, then the rest", async () => {
  setMoment("2026-10-21", "10:00");
  // The 9 am time was only created at 9:30 today, which wouldn't count as missed. Pretend every time
  // has been switched on since midnight today (India time), so today's 9 am dose counts and earlier days don't.
  db.prepare("UPDATE schedules SET created_at = '2026-09-01T00:00:00Z', active_since = '2026-10-20T18:30:00Z'").run();
  checkMissedDoses(db); // today's 9 am Metformin: missed
  await call("POST", "/api/emergency", { token: s.kamalaPhone, body: {} });
  const items = (await call("GET", `/api/elders/${s.kamalaId}/attention`, { token: s.priya })).body;
  assert.equal(items[0].severity, "urgent");
  assert.equal(items[0].kind, "emergency");
  assert.equal(items[1].kind, "missed");
  assert.match(items[1].detail, /Metformin at 9:00 am/);
  assert.equal(items.at(-1).kind, "setup");
  const severities = items.map((i) => ["urgent", "high", "medium", "low"].indexOf(i.severity));
  assert.deepEqual(severities, [...severities].sort((a, b) => a - b));
});

test("the setup check lists what's still to do", async () => {
  const r = await call("GET", `/api/elders/${s.kamalaId}/checkup`, { token: s.priya });
  const item = (key) => r.body.items.find((i) => i.key === key);
  assert.equal(item("phone").ok, true);
  assert.equal(item("purposes").ok, true);
  assert.equal(item("photos").ok, false);
  assert.match(item("photos").fix, /Metformin, Telma/);
  assert.equal(item("meter").ok, false);           // Metformin isn't counted
  assert.equal(item("prescription").ok, true);      // the photo is still there
  assert.equal(item("family").ok, true);            // Arjun helps
  assert.equal(r.body.total, r.body.items.length);
});

// ---------- The doctor visit report ----------

test("the doctor visit report counts taken, skipped and missed, per medicine", async () => {
  const r = await call("GET", `/api/elders/${s.kamalaId}/report?from=2026-09-22&to=2026-10-21`, { token: s.arjun });
  assert.equal(r.status, 200);
  const metformin = r.body.medicines.find((m) => m.name === "Metformin");
  assert.equal(metformin.purpose, "Diabetes (blood sugar)");
  assert.equal(metformin.taken, 27);
  assert.equal(metformin.missed, 1);
  assert.equal(metformin.takenPercent, 96);
  const telma = r.body.medicines.find((m) => m.name === "Telma");
  assert.equal(telma.skipped, 1);
  assert.equal(r.body.days.length, 30);
  assert.equal(r.body.emergencies.length, 1);
  assert.ok(r.body.changes.some((c) => /approved by Priya/.test(c.summary)));
});

test("the report downloads as a spreadsheet (CSV)", async () => {
  const r = await call("GET", `/api/elders/${s.kamalaId}/report?from=2026-09-22&to=2026-10-21&format=csv`, { token: s.priya });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition"), /GoldenDose-Kamala-2026-09-22-to-2026-10-21\.csv/);
  assert.match(r.body, /"Metformin","1000 mg","Diabetes \(blood sugar\)","9:00 am \/ 8:00 pm","27","0","1","96"/);
});

test("a report longer than 92 days is refused", async () => {
  const r = await call("GET", `/api/elders/${s.kamalaId}/report?from=2026-01-01&to=2026-10-21`, { token: s.priya });
  assert.equal(r.status, 400);
});

// ---------- Ask GoldenDose (simple answers; the AI is off in tests) ----------

const ask = (question) => call("POST", `/api/elders/${s.kamalaId}/ask`, { token: s.priya, body: { question } });

test("Ask: what a medicine is for", async () => {
  const r = await ask("What is Telma for?");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "simple");
  assert.match(r.body.answer, /Telma is for: High blood pressure/);
});

test("Ask: what each medicine is for, and how the week went", async () => {
  const all = await ask("What is each medicine for?");
  assert.match(all.body.answer, /Metformin: Diabetes \(blood sugar\)\. Telma: High blood pressure/);
  const week = await ask("How did Kamala do this week?");
  assert.match(week.body.answer, /In the last 7 days Kamala took \d+ of \d+ recorded doses/);
});

test("Ask: everyday words like BP find the right medicine, and recent changes are listed", async () => {
  const bp = await ask("Which tablet is for BP?");
  assert.match(bp.body.answer, /^Telma 40 \(High blood pressure, at 9:00 pm\)\.$/);
  const changes = await ask("What changed recently?");
  assert.match(changes.body.answer, /Priya: /);
});

test("Ask: missed doses", async () => {
  const r = await ask("Did she miss anything this week?");
  assert.match(r.body.answer, /missed 1 dose: Metformin at 9:00 am on Wed,? 21 Oct/);
});

test("Ask never gives medical advice", async () => {
  const r = await ask("Should she take two tablets of Metformin if she missed one?");
  assert.match(r.body.answer, /doctor or pharmacist/);
  assert.doesNotMatch(r.body.answer, /two tablets/);
});

test("Ask: someone unwell right now is told to call 108 first", async () => {
  const r = await ask("She has chest pain, what do I do?");
  assert.match(r.body.answer, /^If Kamala is unwell right now, call 108/);
});

test("Ask: strangers can't ask about Kamala, and an empty question is refused", async () => {
  assert.equal((await call("POST", `/api/elders/${s.kamalaId}/ask`, { token: s.stranger, body: { question: "Hi" } })).status, 403);
  assert.equal((await ask("  ")).status, 400);
});

// ---------- Removing a person from my list ----------

test("Remove from my list: with family still there, Priya just leaves, and Arjun becomes the main caregiver", async () => {
  const ravi = (await call("POST", "/api/elders", { token: s.priya, body: { name: "Ravi Kumar" } })).body;
  await call("POST", `/api/elders/${ravi.id}/caregivers`, { token: s.priya, body: { email: "arjun@example.com" } });
  assert.equal((await call("DELETE", `/api/elders/${ravi.id}/me`, { token: s.stranger })).status, 403);

  const r = await call("DELETE", `/api/elders/${ravi.id}/me`, { token: s.priya });
  assert.deepEqual(r.body, { removed: "me", name: "Ravi Kumar", newMainCaregiver: "Arjun" });
  const priyasList = (await call("GET", "/api/elders", { token: s.priya })).body.map((e) => e.name);
  assert.ok(!priyasList.includes("Ravi Kumar"));
  const arjunsRavi = (await call("GET", "/api/elders", { token: s.arjun })).body.find((e) => e.name === "Ravi Kumar");
  assert.equal(arjunsRavi.role, "owner");
  const [latest] = (await call("GET", `/api/elders/${ravi.id}/changes`, { token: s.arjun })).body;
  assert.equal(latest.summary, "Priya stopped looking after Ravi Kumar; Arjun is now the main caregiver");
  s.raviId = ravi.id;
});

test("Remove from my list: the last person looking after someone deletes them and all their records", async () => {
  await call("POST", `/api/elders/${s.raviId}/medicines`, { token: s.arjun, body: { name: "Telma", times: ["21:00"] } });
  const upload = await call("POST", `/api/elders/${s.raviId}/prescriptions`, { token: s.arjun, raw: PNG, type: "image/png" });
  const before = readdirSync(process.env.PRESCRIPTIONS_DIR).length;
  const code = await call("POST", `/api/elders/${s.raviId}/pairing-code`, { token: s.arjun });
  const phone = (await call("POST", "/api/devices/pair", { body: { code: code.body.code } })).body.deviceToken;

  const r = await call("DELETE", `/api/elders/${s.raviId}/me`, { token: s.arjun });
  assert.deepEqual(r.body, { removed: "person", name: "Ravi Kumar" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM elders WHERE id = ?").get(s.raviId).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM medicines WHERE elder_id = ?").get(s.raviId).n, 0);
  assert.equal((await call("GET", "/api/today", { token: phone })).status, 401); // their phone is disconnected
  assert.equal(readdirSync(process.env.PRESCRIPTIONS_DIR).length, before - 1);   // and the prescription file is gone
  assert.equal((await call("GET", `/api/prescriptions/${upload.body.id}/file`, { token: s.arjun })).status, 404);
});

// ---------- Upgrading an older database ----------

test("an older database keeps its messages and gains the new kinds", () => {
  const folder = mkdtempSync(join(tmpdir(), "goldendose-old-db-"));
  const file = join(folder, "old.db");
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE elders (id INTEGER PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
              pairing_code TEXT UNIQUE, pairing_code_expires_at TEXT, created_at TEXT NOT NULL DEFAULT 'x');
            CREATE TABLE caregivers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT 'x');
            CREATE TABLE other_notifications (id INTEGER PRIMARY KEY, elder_id INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
              caregiver_id INTEGER NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
              kind TEXT NOT NULL CHECK (kind IN ('emergency', 'emergency-cancelled', 'running-low')),
              channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'app')),
              status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'simulated')), message TEXT NOT NULL, sent_at TEXT NOT NULL);
            INSERT INTO elders (id, name) VALUES (1, 'Kamala');
            INSERT INTO caregivers (id, name, email, password_hash) VALUES (1, 'Priya', 'p@example.com', 'x');
            INSERT INTO other_notifications VALUES (1, 1, 1, 'running-low', 'sms', 'simulated', 'Old message', '2026-10-01');`);
  old.close();

  const upgraded = openDatabase(file);
  assert.equal(upgraded.prepare("SELECT message FROM other_notifications").get().message, "Old message");
  upgraded.prepare("INSERT INTO other_notifications (elder_id, caregiver_id, kind, channel, status, message, sent_at) VALUES (1, 1, 'pattern', 'app', 'simulated', 'New', 'now')").run();
  assert.equal(upgraded.prepare("SELECT chemist_lead_days FROM elders").get().chemist_lead_days, 2);
  upgraded.close();
  rmSync(folder, { recursive: true, force: true });
});
