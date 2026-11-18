# GoldenDose — API Design

*Step 5 of 10: the full list of requests the frontend can send, and what the backend replies.*

## How to read this

Every request has three parts:

- **Method**: the kind of action. `GET` = read, `POST` = create, `PUT` = change, `DELETE` = remove.
- **Path**: the address, like `/api/medicines`. A part in curly brackets, like `{id}`,
  is filled in with a real number, for example `/api/medicines/2`.
- **Body**: the data sent along, in JSON. GET and DELETE requests usually have none.

Every reply has a **status code**:

| Code | Meaning | Example |
|---|---|---|
| 200 OK | Worked, here's the data | Today's doses |
| 201 Created | Worked, something new was saved | A dose was recorded |
| 204 No Content | Worked, nothing to send back | Undo succeeded |
| 400 Bad Request | The request didn't make sense | Medicine name is empty |
| 401 Unauthorized | You're not signed in | Missing or expired token |
| 403 Forbidden | Signed in, but not allowed | Priya tries to see a stranger's medicines |
| 404 Not Found | That thing doesn't exist | Medicine 999 |
| 409 Conflict | Clashes with something already saved | This dose is already marked as taken |
| 500 Server Error | The backend had a problem | A bug on our side |

## Who is calling? (signing in)

There are two kinds of callers, and each proves who it is with a **token**: a long secret
code sent with every request, like a wristband at an event.

- **Caregivers** sign in with email and password and get a token.
- **Elders' phones** are **paired** once with a 6-digit code and get a device token.
  Kamala never types a password.

The token goes in a request header: `Authorization: Bearer <token>`.

---

## A. Caregiver accounts

| Method | Path | What it does |
|---|---|---|
| POST | `/api/auth/signup` | Create a caregiver account |
| POST | `/api/auth/login` | Sign in, get a token |
| GET | `/api/me` | Who am I? (name, the elders I look after) |

**Example — sign in**

```
POST /api/auth/login
{ "email": "priya@example.com", "password": "••••••••" }

→ 200 OK
{ "token": "eyJhbGci...", "caregiver": { "id": 1, "name": "Priya Sharma" } }
```

Wrong password → `401 Unauthorized` with `{ "error": "Email or password is wrong." }`.
(We don't say which one was wrong. That would help someone guessing accounts.)

## B. Elders and caregivers

| Method | Path | What it does |
|---|---|---|
| GET | `/api/elders` | List the elders I look after |
| POST | `/api/elders` | Add an elder (I become their `owner`) |
| POST | `/api/elders/{id}/pairing-code` | Make a 6-digit code to pair the elder's phone (valid 10 minutes) |
| POST | `/api/elders/{id}/caregivers` | Invite another caregiver (owner only) |
| PUT | `/api/elders/{id}/my-alerts` | Choose my alert channels for this elder: SMS / WhatsApp / app |

**Example — choose alert channels**

```
PUT /api/elders/1/my-alerts
{ "sms": true, "whatsapp": true, "app": true }

→ 200 OK
{ "elderId": 1, "sms": true, "whatsapp": true, "app": true }
```

## C. Pairing the elder's phone

| Method | Path | What it does |
|---|---|---|
| POST | `/api/devices/pair` | Elder's phone sends the 6-digit code, gets a device token |
| PUT | `/api/devices/me` | Phone updates its push-notification address |

```
POST /api/devices/pair
{ "code": "482913", "platform": "android" }

→ 201 Created
{ "deviceToken": "dvc_7f3a...", "elder": { "id": 1, "name": "Kamala" } }
```

## D. Medicines (caregiver)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/elders/{id}/medicines` | List an elder's medicines with their times |
| POST | `/api/elders/{id}/medicines` | Add a medicine |
| PUT | `/api/medicines/{id}` | Change a medicine or its times |
| DELETE | `/api/medicines/{id}` | Stop a medicine (kept in history, marked inactive) |
| POST | `/api/medicines/{id}/photo` | Upload a photo of the pill or strip |

**Example — add a medicine**

```
POST /api/elders/1/medicines
{
  "name": "Metformin",
  "strength": "500 mg",
  "instruction": "Take one white tablet after food",
  "pillShape": "round",
  "pillColor": "#FFFFFF",
  "times": ["08:00", "20:00"]
}

→ 201 Created
{ "id": 1, "name": "Metformin", ..., "schedules": [ { "id": 1, "time": "08:00" }, { "id": 4, "time": "20:00" } ] }
```

Missing name → `400 Bad Request` with `{ "error": "Enter the medicine name." }`.

## E. Today (the elder's phone) — what the prototype uses

| Method | Path | What it does |
|---|---|---|
| GET | `/api/today` | Today's doses for this phone's elder, with their status |
| POST | `/api/doses` | Record a dose as taken or skipped |
| DELETE | `/api/doses/{id}` | Undo (only within 5 minutes) |

**Example — get today's doses** (this replaces the made-up list in `prototype/app.js`)

```
GET /api/today

→ 200 OK
{
  "elder": { "name": "Kamala" },
  "date": "2026-10-12",
  "doses": [
    { "scheduleId": 1, "time": "08:00", "medicine": { "name": "Metformin", "strength": "500 mg",
      "instruction": "Take one white tablet after food", "pillShape": "round", "pillColor": "#FFFFFF",
      "photoUrl": null }, "status": "taken", "recordedAt": "08:07", "doseId": 56 },
    { "scheduleId": 2, "time": "09:00", "medicine": { "name": "Amlodipine", ... },
      "status": "pending", "recordedAt": null, "doseId": null }
  ]
}
```

**Example — Kamala taps "Taken"**

```
POST /api/doses
{ "scheduleId": 2, "status": "taken" }

→ 201 Created
{ "doseId": 57, "status": "taken", "recordedAt": "09:02" }
```

Tapped twice → `409 Conflict` with `{ "error": "Already marked as taken at 9:02 am." }`.

**Example — Undo**

```
DELETE /api/doses/57

→ 204 No Content
```

After 5 minutes → `409 Conflict` with `{ "error": "This can no longer be undone." }`.

## F. History (caregiver)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/elders/{id}/history?from=2026-10-06&to=2026-10-12` | Every dose in that range, with status |

The part after `?` is called a **query string**: extra options for a GET request.

---

## Things the backend does on its own (no request needed)

| Job | When | What happens |
|---|---|---|
| **Missed-dose check** | Every minute | Finds doses 30+ minutes late with no record, saves them as `missed`, and sends each linked caregiver a message by the channels they chose (SMS, WhatsApp, app). Every message is saved in the `notifications` table. |
| **Message retry** | Every 5 minutes | Tries again for any message that failed. |

These are called **background jobs** or **scheduled jobs**.

## Security rules the backend checks on every request

1. **Is there a valid token?** If not → `401`.
2. **Is this caller allowed to touch this elder?** A caregiver must have a `care_links` row
   for that elder. A device can only see its own elder. If not → `403`.
3. **Is the data sensible?** Times must look like `HH:MM`, names can't be empty, and so on. If not → `400`.

The frontend checks these too, to give quick feedback, but the backend is the one that
**enforces** them. Anyone can tamper with the frontend.


## Added on 17 October 2026

| Method and address | Who | What it does |
|---|---|---|
| `PUT /api/elders/:id/profile` | caregiver | Sets the elder's app `language` (en, hi, bn, mr, te, ta, gu, kn, ml), `hospital {name, phone}` and `chemist {name, phone}` |
| `GET /api/elders/:id/emergencies` | caregiver | Emergency button presses in the last 7 days, with location if shared |
| `PUT /api/medicines/:id/stock` | caregiver | `{ tabletsLeft, perDose }` starts the medicine meter; `tabletsLeft: null` switches it off |
| `POST /api/emergency` | elder's phone | `{ latitude?, longitude? }` records an emergency and tells every caregiver on every channel |
| `POST /api/emergency/:id/ok` | elder's phone | "I'm OK": tells the family, once |

Medicines now include `stock: { tabletsLeft, perDose, countedAt, daysLeft, runningLow }` (or `null`), and
`GET /api/today` includes `elder.language` and `elder.hospital`. A background check tells caregivers
once when a counted medicine has about 5 days left (`backend/src/jobs/runningLow.js`).


## Added on 21 October 2026

Ideas taken from GrepEye (Tensor Analytics' planning platform) and fitted to a family looking after an elder:
GrepEye's exception inbox became **Needs attention**, its inventory optimiser the **smarter medicine meter**,
anomaly detection the **pattern alerts**, exports the **doctor visit report**, the audit trail and plan
versions the **change history**, approval gates **approval of helpers' changes**, data health the **setup
check**, and the copilot **Ask GoldenDose**. Plus **prescriptions** and **what each medicine is for**.

| Method and address | Who | What it does |
|---|---|---|
| `GET /api/medicine-info?name=Glycomet%20500` | caregiver | What a medicine is usually for (`{ generic, usedFor, matched, note }`), from a list of common Indian brands and generics, or `null`. General information, not advice |
| `GET /api/attention` | caregiver | **Needs attention** for everyone I look after, most serious first: `urgent` (emergency), `high` (missed today, run out), `medium` (time to order, patterns, approvals, phone quiet), `low` (setup) |
| `GET /api/elders/:id/attention` | caregiver | The same, for one person |
| `GET /api/elders/:id/checkup` | caregiver | The setup check: `{ done, total, items: [{ key, ok, label, fix, link }] }` |
| `GET /api/elders/:id/report?from=&to=` | caregiver | The doctor visit report (up to 92 days): totals, per medicine (taken, skipped, missed, taken %, usual lateness), each day, current medicines, changes, emergencies, prescriptions. Add `&format=csv` for a spreadsheet |
| `GET /api/elders/:id/changes?limit=100` | caregiver | The change history, newest first: who, when, what (in words), why |
| `GET /api/elders/:id/medicines-on?date=` | caregiver | The medicine list as it was at the end of that day, rebuilt from the history |
| `GET /api/elders/:id/pending-changes` | caregiver | Helpers' changes waiting for the main caregiver |
| `POST /api/pending-changes/:id/approve` or `/reject` | main caregiver | Applies (or drops) a waiting change |
| `GET /api/elders/:id/prescriptions` | caregiver | Prescriptions, newest first |
| `POST /api/elders/:id/prescriptions` | caregiver | The body is a JPEG, PNG, WebP or PDF (up to 10 MB) |
| `PUT /api/prescriptions/:id` | caregiver | `{ doctor, issuedOn, note }` |
| `GET /api/prescriptions/:id/file` | caregiver | The file itself, only for that elder's family (prescriptions are never served openly) |
| `DELETE /api/prescriptions/:id` | caregiver | Removes the record and the file |
| `POST /api/elders/:id/ask` | caregiver | `{ question, history }` → `{ answer, source: "ai" or "simple", note }`. Uses Claude Opus 5.5 when `ANTHROPIC_API_KEY` is set; otherwise simple built-in answers. Never gives medical advice |

Changes to existing addresses:

- Medicines have `purpose` (what it's for) and `hardToGet`. Adding, changing and stopping accept an optional
  `reason` (for stopping: `?reason=`). When the family has switched approval on, a **helper's** add, change or
  stop replies `202 { pending: true, pendingId, summary }` instead, and the main caregivers are told.
- `PUT /api/elders/:id/profile` also takes `chemist.leadDays` (0–30) and `requireApproval` (main caregiver only).
- The meter adds `orderAheadDays`, `orderBy` and `runOutOn`. It warns at the chemist's days + 3 spare days
  (+ 7 if hard to get), so 5 days with the usual settings. A dose Kamala marked "Skip" uses no tablet.
- `GET /api/today` includes each medicine's `purpose`; Kamala's app shows "For: …" and reads it aloud.

Background: once an hour the job looks for **patterns** (more missed doses than the 3 weeks before, the same
dose time missed on 3+ of the last 7 days, a dose taken 30+ minutes later than it used to be, 4+ skips) and
tells the family, the same pattern at most once a week.

Also added on 21 October 2026, so both phones show they're connected:

- `GET /api/today` includes `elder.family`: the first names of the family the phone is connected to, main caregivers
  first (`["Priya", "Arjun"]`). Kamala's app shows "Connected to your family: Priya, Arjun".
- `DELETE /api/devices/me` (any signed-in phone): the phone disconnects itself; its token stops working.
- `DELETE /api/elders/:id/devices` (any of the elder's family): **Disconnect this phone**, for a lost, stolen or
  given-away phone. Every phone connected to the elder stops working at once (Kamala's app then asks for a new code,
  in her language). Recorded in the change history.
- `DELETE /api/elders/:id/me` (any of the elder's family): **Remove from my list**. If others in the family look after
  the person, I simply leave (`{ removed: "me", newMainCaregiver }`; if I was the only main caregiver, the
  longest-standing helper becomes one). If I'm the only one, the person and all their records are deleted, their
  phone disconnected, and their photos and prescriptions removed (`{ removed: "person" }`). The app asks first.
- The family app reads `GET /api/elders/:id/checkup` to show "✓ Connected. Last used …" on the person's page and
  "✓ Phone connected" on the home list. The connection code moves under "New or replacement phone?".


## Added on 27 October 2026: health records

Blood reports, the tests the doctor wants repeated, home blood pressure, and the next doctor visit, with reminders
for the family. **GoldenDose never interprets a result:** "outside the range" always means the range printed on that
report, and every reminder points to the doctor. The list of common tests (`backend/src/health-tests.js`) has names
and units only, no ranges.

| Method and address | Who | What it does |
|---|---|---|
| `GET /api/lab-tests` | caregiver | Common tests (HbA1c, sugar, creatinine, eGFR, cholesterol, TSH, haemoglobin, salts, vitamins, INR…) with their usual units |
| `GET /api/elders/:id/health-summary` | caregiver | Reports with results and flags, each test over time (trend, repeat interval, next due), BP readings and settings, the next visit |
| `POST /api/elders/:id/lab-reports` | caregiver | `{ reportDate, lab, note, results: [{ testKey or testName, value, unit, rangeLow, rangeHigh }] }` |
| `PUT /api/lab-reports/:id` | caregiver | Change the date, lab, note or results |
| `POST /api/lab-reports/:id/file` | caregiver | A photo or PDF of the report (private, like prescriptions); `GET` the same address to open it |
| `POST /api/lab-reports/:id/doctor-seen` | caregiver | "The doctor has seen it" (`{ seen: false }` to undo) |
| `DELETE /api/lab-reports/:id` | caregiver | The report, its results and its file |
| `PUT /api/elders/:id/test-followups` | caregiver | `{ testKey, repeatMonths: 1–24 or null }`: how often the doctor wants the test |
| `POST /api/elders/:id/bp` | caregiver | `{ systolic, diastolic, pulse?, takenAt?, note? }`; `DELETE /api/bp/:id` removes one |
| `PUT /api/elders/:id/health-settings` | caregiver | `{ bpCheckDays, bpTarget: { systolic, diastolic } or null, nextVisit: { on, note } or null }` |

Reminders (in "Needs attention", and sent once by message by the hourly check): a report with results outside the printed
range that the doctor hasn't seen; a test that went the same way in each of the last 3 reports; a test due within 7 days
or overdue; no BP reading for longer than chosen; the latest BP above the doctor's target; the doctor visit in the week
ahead. Suggestions that stay in the app: "takes medicine for blood pressure: turn on BP checks", "was the visit done?".
The doctor visit report and Ask GoldenDose include all of it.

Also on 27 October 2026:

| Method and address | Who | What it does |
|---|---|---|
| `POST /api/elders/:id/readings` | caregiver | `{ kind: "weight" or "sugar", value, context? (fasting, after-meal, random), takenAt?, note? }`; `DELETE /api/readings/:id` |
| `POST /api/elders/:id/doctor-questions` | caregiver | `{ text }`: a question for the next visit |
| `PUT /api/doctor-questions/:id` | caregiver | `{ answered, answer? }`: what the doctor said; `DELETE` removes it |

`PUT /api/elders/:id/health-settings` also takes `lab: { name, phone }` (the family's lab), `weightCheckDays` and
`sugarCheckDays`. The Health page's **Book a home collection** opens WhatsApp to that lab with the tests that are
due. Reminders also cover weight and sugar checks, a weight change of 5% or more in about a month ("worth telling the
doctor"), and the visit reminder counts the questions to ask. The doctor visit report prints the open questions and
the weight and sugar readings.
