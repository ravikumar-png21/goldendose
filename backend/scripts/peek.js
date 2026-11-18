// A look inside the database, for demos and learning.  Run with:  npm run peek
// Shows the latest dose records and caregiver messages, straight from the tables.

import { openDatabase } from "../src/db.js";
import { DB_FILE } from "../src/config.js";

const db = openDatabase(DB_FILE);
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

console.log(`\nDatabase file: ${DB_FILE}\n`);
console.log("How many rows each table has:");
console.table(Object.fromEntries(
  ["caregivers", "elders", "care_links", "medicines", "schedules", "dose_log", "devices", "notifications"].map((t) => [t, count(t)]),
));

console.log("\nThe 8 latest rows of the dose_log table (what actually happened):");
const doses = db.prepare(`
  SELECT d.id, e.name AS elder, e.timezone, m.name AS medicine, s.time_of_day AS due, d.date, d.status, d.recorded_by, d.recorded_at
  FROM dose_log d JOIN schedules s ON s.id = d.schedule_id JOIN medicines m ON m.id = s.medicine_id JOIN elders e ON e.id = m.elder_id
  ORDER BY d.id DESC LIMIT 8`).all();
// The database stores moments in UTC (world time). Show them in the elder's own time.
console.table(doses.map(({ timezone, recorded_at, ...row }) => ({
  ...row,
  recorded: new Date(recorded_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone }).toLowerCase(),
})));

console.log("\nThe 6 latest messages to caregivers (the notifications table):");
console.table(db.prepare(`
  SELECT n.id, c.name AS caregiver, n.channel, n.status, n.message
  FROM notifications n JOIN caregivers c ON c.id = n.caregiver_id
  ORDER BY n.id DESC LIMIT 6`).all());
