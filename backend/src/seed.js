// Fills the database with demo data so there's something to look at.
// Run with:  npm run seed      (WARNING: wipes the local database and starts fresh)
//
// Demo sign-in for caregivers (test accounts that exist only on this computer):
//   priya@example.com / goldendose-demo   (owner for Kamala and Ramesh)
//   arjun@example.com / goldendose-demo   (helper for Kamala)

import { rmSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDatabase, transaction } from "./db.js";
import { hashPassword } from "./auth.js";
import { DB_FILE } from "./config.js";
import { localParts } from "./time.js";
import { clock } from "./clock.js";

export const DEMO_PASSWORD = "goldendose-demo";

// Two safety rules, because this file DELETES the database:
// 1. It never runs on a real server (hosting services set NODE_ENV=production).
if (process.env.NODE_ENV === "production") {
  console.error("Refused: the demo data can't be loaded on a real server (NODE_ENV=production). It would delete every family's records.");
  process.exit(1);
}
// 2. If there's already a database, keep a dated copy of it first, next to it.
if (DB_FILE !== ":memory:" && existsSync(DB_FILE)) {
  const stamp = clock.now().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-"); // 20261115-093000
  const folder = join(dirname(DB_FILE), `backup-${stamp}`);
  mkdirSync(folder, { recursive: true });
  copyFileSync(DB_FILE, join(folder, "goldendose.db"));
  if (process.env.QUIET !== "1") console.log(`The old database was copied to ${folder} before starting fresh.`);
}

rmSync(DB_FILE, { force: true });
const db = openDatabase(DB_FILE);

// Schedules are "created" a month ago, so today's doses count from the start of the day, and there's history.
const aMonthAgo = new Date(clock.now().getTime() - 30 * 86_400_000).toISOString();

transaction(db, () => {
  const addCaregiver = db.prepare("INSERT INTO caregivers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)");
  const priya = Number(addCaregiver.run("Priya Sharma", "priya@example.com", "+91 98000 00010", hashPassword(DEMO_PASSWORD)).lastInsertRowid);
  const arjun = Number(addCaregiver.run("Arjun Sharma", "arjun@example.com", "+91 98000 00020", hashPassword(DEMO_PASSWORD)).lastInsertRowid);

  const addElder = db.prepare("INSERT INTO elders (name, timezone) VALUES (?, 'Asia/Kolkata')");
  const kamala = Number(addElder.run("Kamala").lastInsertRowid);
  const ramesh = Number(addElder.run("Ramesh").lastInsertRowid);

  const link = db.prepare("INSERT INTO care_links (caregiver_id, elder_id, role, notify_sms, notify_whatsapp, notify_app) VALUES (?, ?, ?, ?, ?, ?)");
  link.run(priya, kamala, "owner", 1, 1, 1);
  link.run(priya, ramesh, "owner", 0, 1, 1);
  link.run(arjun, kamala, "helper", 0, 0, 1);

  const addMedicine = db.prepare(
    "INSERT INTO medicines (elder_id, name, strength, instruction, purpose, pill_shape, pill_color, pill_color2) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const addTime = db.prepare("INSERT INTO schedules (medicine_id, time_of_day, created_at) VALUES (?, ?, ?)");
  const medicine = (elderId, name, strength, instruction, purpose, shape, color, color2, times) => {
    const id = Number(addMedicine.run(elderId, name, strength, instruction, purpose, shape, color, color2).lastInsertRowid);
    return times.map((t) => Number(addTime.run(id, t, aMonthAgo).lastInsertRowid));
  };

  // The same medicines as the prototype, with what each one is for
  const [metMorning, metEvening] = medicine(kamala, "Metformin", "500 mg", "Take one white tablet after food", "Diabetes (blood sugar)", "round", "#FFFFFF", null, ["08:00", "20:00"]);
  const [amlodipine] = medicine(kamala, "Amlodipine", "5 mg", "Take one pink tablet", "High blood pressure", "oval", "#F4A7B9", null, ["09:00"]);
  const [vitaminD] = medicine(kamala, "Vitamin D3", "1000 IU", "Take one yellow capsule with lunch", "Vitamin D deficiency; bone strength", "capsule", "#F2C14E", "#FFFFFF", ["13:00"]);
  const [atorvastatin] = medicine(kamala, "Atorvastatin", "10 mg", "Take one blue tablet at bedtime", "High cholesterol; heart and stroke protection", "oval", "#8FB8F0", null, ["21:30"]);
  medicine(ramesh, "Telmisartan", "40 mg", "Take one white tablet before breakfast", "High blood pressure", "oval", "#FFFFFF", null, ["07:30"]);

  db.prepare("UPDATE elders SET chemist_name = 'Sharma Medical', chemist_phone = '+91 98450 11111' WHERE id = ?").run(kamala);

  // Four weeks of history for Kamala. Mostly taken, on time. Vitamin D at lunch is the one she forgets,
  // more so this past week, so "Needs attention" and the doctor report have a pattern to show.
  const log = db.prepare("INSERT INTO dose_log (schedule_id, date, status, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?)");
  const doses = [[metMorning, "08:00"], [amlodipine, "09:00"], [vitaminD, "13:00"], [metEvening, "20:00"], [atorvastatin, "21:30"]];
  for (let back = 28; back >= 1; back--) {
    const date = localParts(new Date(clock.now().getTime() - back * 86_400_000), "Asia/Kolkata").date;
    const at = (hhmm, extraMinutes) => new Date(new Date(`${date}T${hhmm}:00+05:30`).getTime() + extraMinutes * 60_000).toISOString();
    for (const [schedule, time] of doses) {
      const missed = time === "13:00" && (back <= 6 ? back % 2 === 1 : back % 9 === 0); // 3 of the last 6 days, rarely before
      const skipped = time === "21:30" && back === 12;
      if (missed) log.run(schedule, date, "missed", at(time, 30), "system");
      else log.run(schedule, date, skipped ? "skipped" : "taken", at(time, skipped ? 2 : 3 + ((back * 7 + time.length) % 12)), "elder");
    }
  }
});

console.log("Demo data added:");
console.log("  Caregivers: Priya (looks after Kamala and Ramesh), Arjun (helps with Kamala)");
console.log("  Kamala: 5 doses a day, with 4 weeks of history. Ramesh: 1 dose a day.");
console.log(`  Sign in as priya@example.com with password "${DEMO_PASSWORD}"`);
