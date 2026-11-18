-- GoldenDose database tables (see docs/DATA-DESIGN.md).
-- This is SQL, the language databases understand.
-- "IF NOT EXISTS" means: create the table only the first time. Running this again changes nothing.
--
-- Words you'll see:
--   PRIMARY KEY  the row's id, unique and never reused
--   REFERENCES   a foreign key: this column points to another table's id
--   NOT NULL     this column must always have a value
--   UNIQUE       no two rows can have the same value here
--   CHECK        only these values are allowed
--   ON DELETE CASCADE  if the row pointed to is deleted, delete this row too

-- People who sign in to manage medicines (Priya)
CREATE TABLE IF NOT EXISTS caregivers (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- People taking medicine (Kamala). No password: their phone is paired with a code instead.
CREATE TABLE IF NOT EXISTS elders (
  id                       INTEGER PRIMARY KEY,
  name                     TEXT NOT NULL,
  timezone                 TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  pairing_code             TEXT UNIQUE,
  pairing_code_expires_at  TEXT,
  language                 TEXT NOT NULL DEFAULT 'en',  -- the language of the elder's app: en, hi, bn, mr, te, ta, gu, kn, ml
  hospital_name            TEXT,                        -- the hospital to call in an emergency (chosen by the family)
  hospital_phone           TEXT,
  chemist_name             TEXT,                        -- the family's own chemist, for refill messages on WhatsApp
  chemist_phone            TEXT,
  chemist_lead_days        INTEGER NOT NULL DEFAULT 2,  -- how many days the chemist takes to get medicine ready
  require_approval         INTEGER NOT NULL DEFAULT 0,  -- 1 = helpers' medicine changes wait for the main caregiver's OK
  bp_check_days            INTEGER,                     -- check blood pressure every N days (NULL = no BP reminders)
  bp_target_sys            INTEGER,                     -- the BP target the doctor gave, such as 140/90 (NULL = none)
  bp_target_dia            INTEGER,
  next_visit_on            TEXT,                        -- the next doctor visit, "2026-11-03"
  next_visit_note          TEXT NOT NULL DEFAULT '',
  lab_name                 TEXT,                        -- the family's own lab, for booking a home sample collection
  lab_phone                TEXT,
  weight_check_days        INTEGER,                     -- weigh every N days (NULL = no reminders)
  sugar_check_days         INTEGER,                     -- check blood sugar every N days (NULL = no reminders)
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Who looks after whom. One row per caregiver–elder pair (the many-to-many "join table").
CREATE TABLE IF NOT EXISTS care_links (
  id               INTEGER PRIMARY KEY,
  caregiver_id     INTEGER NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  elder_id         INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('owner', 'helper')),
  notify_sms       INTEGER NOT NULL DEFAULT 1,   -- 1 = yes, 0 = no
  notify_whatsapp  INTEGER NOT NULL DEFAULT 1,
  notify_app       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (caregiver_id, elder_id)
);

-- What each elder takes
CREATE TABLE IF NOT EXISTS medicines (
  id           INTEGER PRIMARY KEY,
  elder_id     INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  strength     TEXT NOT NULL DEFAULT '',
  instruction  TEXT NOT NULL DEFAULT '',
  pill_shape   TEXT NOT NULL DEFAULT 'round' CHECK (pill_shape IN ('round', 'oval', 'capsule')),
  pill_color   TEXT NOT NULL DEFAULT '#FFFFFF',
  pill_color2  TEXT,
  photo_url    TEXT,
  purpose      TEXT NOT NULL DEFAULT '',         -- what it's for, as the doctor said ("Diabetes (blood sugar)")
  hard_to_get  INTEGER NOT NULL DEFAULT 0,       -- 1 = the chemist often has to order it: warn the family earlier
  active       INTEGER NOT NULL DEFAULT 1,       -- 0 = stopped (kept so history still makes sense)
  -- The medicine meter: how many tablets were in hand when last counted, and how many make one dose.
  stock_count       REAL,                        -- NULL = not counted, no meter
  stock_counted_at  TEXT,
  per_dose          REAL NOT NULL DEFAULT 1,
  stock_alerted_at  TEXT,                        -- when the family was told it's running low (once per count)
  restarted_at      TEXT,                        -- when a stopped medicine was last started again (NULL = never stopped)
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- When each medicine is taken. One row per time ("08:00", "20:00").
-- A removed time is switched off (active = 0), not deleted, because the dose log points to it.
CREATE TABLE IF NOT EXISTS schedules (
  id           INTEGER PRIMARY KEY,
  medicine_id  INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  time_of_day  TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  active_since TEXT                              -- when this time was last switched on (NULL = since created_at)
);

-- What actually happened. The most important table.
-- UNIQUE (schedule_id, date): only one record per dose per day, so nothing is counted twice.
CREATE TABLE IF NOT EXISTS dose_log (
  id           INTEGER PRIMARY KEY,
  schedule_id  INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('taken', 'skipped', 'missed')),
  recorded_at  TEXT NOT NULL,
  recorded_by  TEXT NOT NULL CHECK (recorded_by IN ('elder', 'caregiver', 'system')),
  UNIQUE (schedule_id, date)
);

-- Signed-in phones and browsers. Each has a secret token (stored scrambled, like passwords).
-- A device belongs to either an elder or a caregiver, never both.
CREATE TABLE IF NOT EXISTS devices (
  id            INTEGER PRIMARY KEY,
  elder_id      INTEGER REFERENCES elders(id) ON DELETE CASCADE,
  caregiver_id  INTEGER REFERENCES caregivers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'android', 'ios')),
  push_token    TEXT,
  last_seen     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT,                               -- the token stops working after this; moved forward each time it's used
  CHECK ((elder_id IS NULL) <> (caregiver_id IS NULL))
);

-- Every message sent to a caregiver, so we can always answer "Was Priya actually told?"
CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY,
  dose_log_id   INTEGER NOT NULL REFERENCES dose_log(id) ON DELETE CASCADE,
  caregiver_id  INTEGER NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'app')),
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'simulated')),
  message       TEXT NOT NULL,
  sent_at       TEXT NOT NULL
);

-- Every time the elder presses the emergency button.
CREATE TABLE IF NOT EXISTS emergencies (
  id          INTEGER PRIMARY KEY,
  elder_id    INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  latitude    REAL,                               -- where the phone was, if the elder allowed location
  longitude   REAL,
  created_at  TEXT NOT NULL,
  cancelled_at TEXT,                              -- "I'm OK" pressed afterwards
  presses     INTEGER NOT NULL DEFAULT 1,         -- presses within a few minutes count as one emergency
  last_pressed_at TEXT
);

-- Messages that aren't about one dose: emergencies and "running low" warnings.
CREATE TABLE IF NOT EXISTS other_notifications (
  id            INTEGER PRIMARY KEY,
  elder_id      INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  caregiver_id  INTEGER NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('emergency', 'emergency-cancelled', 'running-low', 'pattern', 'approval-needed', 'health', 'taken-offline')),
  channel       TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'app')),
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'simulated')),
  message       TEXT NOT NULL,
  sent_at       TEXT NOT NULL
);

-- Doctors' prescriptions: a photo or PDF of each one, kept private (only the elder's family can open them).
CREATE TABLE IF NOT EXISTS prescriptions (
  id            INTEGER PRIMARY KEY,
  elder_id      INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,                    -- a random name in data/prescriptions
  kind          TEXT NOT NULL CHECK (kind IN ('jpg', 'png', 'webp', 'pdf')),
  doctor        TEXT NOT NULL DEFAULT '',
  issued_on     TEXT,                             -- the date on the prescription, "2026-10-03"
  note          TEXT NOT NULL DEFAULT '',
  uploaded_by   INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);

-- Every change the family makes, and who made it: "Arjun changed Metformin: 8:00 am → 9:00 am".
-- "after" holds the medicine as it was right after the change, so the list on any past date can be rebuilt.
CREATE TABLE IF NOT EXISTS changes (
  id            INTEGER PRIMARY KEY,
  elder_id      INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  caregiver_id  INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  medicine_id   INTEGER REFERENCES medicines(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,                    -- added, changed, stopped, counted, details, prescription-added, ...
  summary       TEXT NOT NULL,                    -- in plain words
  reason        TEXT NOT NULL DEFAULT '',         -- why, if they said ("Doctor changed the dose on 3 Oct")
  after         TEXT,                             -- JSON
  created_at    TEXT NOT NULL
);

-- Medicine changes by a helper, waiting for the main caregiver's OK (only when the family switched approval on).
CREATE TABLE IF NOT EXISTS pending_changes (
  id            INTEGER PRIMARY KEY,
  elder_id      INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  caregiver_id  INTEGER NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  medicine_id   INTEGER REFERENCES medicines(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('add', 'change', 'stop')),
  request       TEXT NOT NULL,                    -- JSON: the checked values to apply
  summary       TEXT NOT NULL,
  reason        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'approved', 'rejected')),
  decided_by    INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  decided_at    TEXT,
  created_at    TEXT NOT NULL
);

-- Patterns already told to the family, so the same one isn't sent again within a week.
CREATE TABLE IF NOT EXISTS pattern_alerts (
  id            INTEGER PRIMARY KEY,
  elder_id      INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  pattern_key   TEXT NOT NULL,                    -- "missed-more", "slot-20:00", "later-08:00"
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Blood reports: the date, the lab, a photo or PDF (kept private like prescriptions), and whether the doctor has seen it.
CREATE TABLE IF NOT EXISTS lab_reports (
  id              INTEGER PRIMARY KEY,
  elder_id        INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  report_date     TEXT NOT NULL,                    -- the date on the report
  lab             TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  file_name       TEXT,                             -- a random name in data/prescriptions, or NULL
  kind            TEXT CHECK (kind IN ('jpg', 'png', 'webp', 'pdf')),
  doctor_seen_at  TEXT,                             -- when the family marked "the doctor has seen it"
  doctor_seen_by  INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  added_by        INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL
);

-- The numbers on a report, as the family typed them, with the normal range printed on that report.
-- GoldenDose never uses its own ranges: "outside the range" always means the lab's printed range.
CREATE TABLE IF NOT EXISTS lab_results (
  id          INTEGER PRIMARY KEY,
  report_id   INTEGER NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
  elder_id    INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  test_key    TEXT NOT NULL,                        -- "hba1c", or "other:<name>" for a test not on the list
  test_name   TEXT NOT NULL,
  value       REAL NOT NULL,
  unit        TEXT NOT NULL DEFAULT '',
  range_low   REAL,
  range_high  REAL
);

-- How often the doctor wants each test repeated: "HbA1c every 3 months".
CREATE TABLE IF NOT EXISTS test_followups (
  id             INTEGER PRIMARY KEY,
  elder_id       INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  test_key       TEXT NOT NULL,
  test_name      TEXT NOT NULL,
  repeat_months  INTEGER NOT NULL,
  set_by         INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  set_at         TEXT NOT NULL,
  UNIQUE (elder_id, test_key)
);

-- Home blood pressure readings.
CREATE TABLE IF NOT EXISTS bp_readings (
  id           INTEGER PRIMARY KEY,
  elder_id     INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  systolic     INTEGER NOT NULL,
  diastolic    INTEGER NOT NULL,
  pulse        INTEGER,
  taken_at     TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  recorded_by  INTEGER REFERENCES caregivers(id) ON DELETE SET NULL
);

-- Weight and blood sugar readings, like the BP log.
CREATE TABLE IF NOT EXISTS health_readings (
  id           INTEGER PRIMARY KEY,
  elder_id     INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('weight', 'sugar')),
  value        REAL NOT NULL,                       -- kg, or mg/dL
  context      TEXT CHECK (context IN ('fasting', 'after-meal', 'random')),  -- sugar only
  taken_at     TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  recorded_by  INTEGER REFERENCES caregivers(id) ON DELETE SET NULL
);

-- Questions to ask at the next doctor visit, added by anyone in the family.
CREATE TABLE IF NOT EXISTS doctor_questions (
  id           INTEGER PRIMARY KEY,
  elder_id     INTEGER NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  added_by     INTEGER REFERENCES caregivers(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  answered_at  TEXT,
  answer       TEXT NOT NULL DEFAULT ''
);

-- Wrong tries at guessable secrets (the pairing code, a password), so they can be limited: see limiter.js.
CREATE TABLE IF NOT EXISTS failed_attempts (
  id    INTEGER PRIMARY KEY,
  kind  TEXT NOT NULL,                              -- "pair" or "login"
  who   TEXT NOT NULL,                              -- a network address, or "email|address"
  at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS failed_attempts_lookup ON failed_attempts (kind, who, at);
