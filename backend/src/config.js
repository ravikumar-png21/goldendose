// Settings and rules in one place.
// The rules come straight from docs/REQUIREMENTS.md, so changing a rule means changing one line here.

import { fileURLToPath } from "node:url";

// Which "door" (port) on this computer the backend listens at: http://localhost:3000
export const PORT = Number(process.env.PORT ?? 3000);

// Where the database file lives. Tests use ":memory:" (a throwaway database in memory).
export const DB_FILE = process.env.DB_FILE ?? fileURLToPath(new URL("../data/goldendose.db", import.meta.url));

// Where uploaded pill photos are saved. A function so tests can point it somewhere temporary.
export function photosDir() {
  return process.env.PHOTOS_DIR ?? fileURLToPath(new URL("../data/photos", import.meta.url));
}

export const RULES = {
  UNDO_MINUTES: 5,          // "Taken" can be undone for 5 minutes
  EARLY_MINUTES: 60,        // a dose can be marked up to 60 minutes before it's due
  MISSED_AFTER_MINUTES: 30, // after 30 minutes with no answer, caregivers are told
  MISSED_LOOK_BACK_HOURS: 48, // the missed-dose check looks this far back, so it catches up after the server was off
  OFFLINE_TAP_HOURS: 24,    // a tap made without internet is accepted, with its real time, for up to 24 hours
  LATE_TAP_HOURS: 6,        // a dose can still be marked up to 6 hours after it was due, even past midnight
  PAIRING_CODE_MINUTES: 10, // a pairing code works for 10 minutes
  // Wrong tries (see limiter.js). "In 15 minutes" means: counted over the last 15 minutes.
  TRY_WINDOW_MINUTES: 15,
  PAIR_TRIES: 5,            // wrong pairing codes from one network address before it must wait
  PAIR_TRIES_EVERYONE: 50,  // wrong pairing codes from all addresses together, in 10 minutes, before pairing pauses
  PAIR_EVERYONE_MINUTES: 10,
  LOGIN_TRIES: 5,           // wrong passwords for one email from one address before it must wait
  LOGIN_TRIES_ADDRESS: 20,  // wrong passwords from one address, across all emails, before it must wait
  SIGN_IN_DAYS: 30,         // a family member stays signed in for 30 days after they last used the app
  PHONE_SIGN_IN_DAYS: 365,  // the elder's phone stays connected for a year after it was last used (Kamala can't sign in again herself)
  EMERGENCY_GROUP_MINUTES: 5, // presses of the emergency button this close together count as one emergency
  HISTORY_MAX_DAYS: 92,     // the longest history a caregiver can ask for at once
  RUNNING_LOW_DAYS: 5,      // with the usual settings, the family is told when a medicine has about 5 days left:
  CHEMIST_LEAD_DAYS: 2,     //   the chemist's usual 2 days to get it ready...
  SPARE_DAYS: 3,            //   ...plus 3 spare days, in case of delays
  HARD_TO_GET_DAYS: 7,      // a medicine the chemist often has to order: warn 7 days earlier still
  PATTERN_REPEAT_DAYS: 7,   // the same pattern ("more missed doses than usual") is told at most once a week
  PHONE_QUIET_HOURS: 24,    // Kamala's phone not heard from for this long goes on the "Needs attention" list
};

// The languages Kamala's app can speak and show. The family chooses one for each elder.
export const LANGUAGES = ["en", "hi", "bn", "mr", "te", "ta", "gu", "kn", "ml"];

// Where prescription photos and PDFs are saved. Never served openly: only the elder's family can open them.
export function prescriptionsDir() {
  return process.env.PRESCRIPTIONS_DIR ?? fileURLToPath(new URL("../data/prescriptions", import.meta.url));
}
