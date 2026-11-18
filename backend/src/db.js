// Opening the database.
// We use SQLite, which is built into Node.js: the whole database is one file (data/goldendose.db).
// When the app goes online (Step 9) we move to PostgreSQL, which speaks the same SQL.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

export function openDatabase(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;"); // make SQLite enforce REFERENCES rules
  db.exec(schema);                      // create the tables if they don't exist yet
  upgrade(db);
  return db;
}

// A database made by an older version of GoldenDose lacks the newest columns.
// "CREATE TABLE IF NOT EXISTS" doesn't add columns to a table that already exists, so add them here.
function upgrade(db) {
  const addColumn = (table, column, definition) => {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn("elders", "language", "TEXT NOT NULL DEFAULT 'en'");
  addColumn("elders", "hospital_name", "TEXT");
  addColumn("elders", "hospital_phone", "TEXT");
  addColumn("elders", "chemist_name", "TEXT");
  addColumn("elders", "chemist_phone", "TEXT");
  addColumn("medicines", "stock_count", "REAL");
  addColumn("medicines", "stock_counted_at", "TEXT");
  addColumn("medicines", "per_dose", "REAL NOT NULL DEFAULT 1");
  addColumn("medicines", "stock_alerted_at", "TEXT");
  addColumn("medicines", "purpose", "TEXT NOT NULL DEFAULT ''");
  addColumn("medicines", "hard_to_get", "INTEGER NOT NULL DEFAULT 0");
  addColumn("elders", "chemist_lead_days", "INTEGER NOT NULL DEFAULT 2");
  addColumn("elders", "require_approval", "INTEGER NOT NULL DEFAULT 0");
  addColumn("elders", "bp_check_days", "INTEGER");
  addColumn("elders", "bp_target_sys", "INTEGER");
  addColumn("elders", "bp_target_dia", "INTEGER");
  addColumn("elders", "next_visit_on", "TEXT");
  addColumn("elders", "next_visit_note", "TEXT NOT NULL DEFAULT ''");
  addColumn("elders", "lab_name", "TEXT");
  addColumn("elders", "lab_phone", "TEXT");
  addColumn("elders", "weight_check_days", "INTEGER");
  addColumn("elders", "sugar_check_days", "INTEGER");
  addColumn("devices", "expires_at", "TEXT");
  addColumn("schedules", "active_since", "TEXT");
  addColumn("medicines", "restarted_at", "TEXT");
  addColumn("emergencies", "presses", "INTEGER NOT NULL DEFAULT 1");
  addColumn("emergencies", "last_pressed_at", "TEXT");

  // Older databases allow fewer kinds of "other" message. SQLite can't change a CHECK rule,
  // so make the table again with the new rule and copy the messages across.
  const other = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'other_notifications'").get();
  if (other && !other.sql.includes("'taken-offline'")) { // the newest kind: older databases don't allow it yet
    transaction(db, () => {
      db.exec("ALTER TABLE other_notifications RENAME TO other_notifications_old");
      db.exec(schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS other_notifications"), schema.indexOf(");", schema.indexOf("CREATE TABLE IF NOT EXISTS other_notifications")) + 2));
      db.exec("INSERT INTO other_notifications SELECT * FROM other_notifications_old");
      db.exec("DROP TABLE other_notifications_old");
    });
  }
}

// Runs several database changes as one unit (a "transaction"):
// either all of them are saved, or, if anything fails, none of them are.
// Example: adding a medicine AND its times. We never want a medicine saved without its times.
// If a transaction is already running (one change made of smaller changes), the work simply joins it.
export function transaction(db, work) {
  if (db.isTransaction) return work();
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
