# GoldenDose backend

The API, database and missed-dose checker (Step 6). Built with Node.js, Express and SQLite.

## Commands

Run these inside the `backend` folder.

| Command | What it does |
|---|---|
| `npm install` | Downloads the packages the backend needs (only needed once, or after a fresh copy) |
| `npm run seed` | **Wipes** the local database and fills it with demo data |
| `npm start` | Starts the backend at http://localhost:3000 (stop it with Ctrl + C) |
| `npm run dev` | Same, but restarts automatically whenever you save a code file |
| `npm run tour` | A guided tour of the API (the backend must be running) |
| `npm run peek` | Shows the latest rows in the database tables |
| `npm test` | Runs all the backend tests |

While it's running, the backend also serves the screens from the `frontend` folder:

- http://localhost:3000/ is Kamala's app (the elder's phone)
- http://localhost:3000/care/ is the caregiver app

## Demo accounts (local test data only)

| Email | Password | Looks after |
|---|---|---|
| priya@example.com | goldendose-demo | Kamala (owner), Ramesh (owner) |
| arjun@example.com | goldendose-demo | Kamala (helper) |

## Where things are

```
src/
  server.js          starts everything
  app.js             connects all the routes, handles errors
  config.js          settings and rules (5-minute undo, 30-minute missed, ...)
  schema.sql         the database tables
  db.js              opens the database
  auth.js            passwords, tokens, "who is calling?"
  validate.js        checks every input
  time.js            timezone-aware times
  clock.js           the clock (replaced with a pretend one in tests)
  notify.js          caregiver messages (simulated until Step 9)
  seed.js            demo data
  routes/            one file per API group (see docs/API-DESIGN.md)
  jobs/missedDoses.js  the every-minute missed-dose check
test/api.test.js     automatic tests
scripts/walkthrough.js  the guided tour
data/goldendose.db    the database file (created automatically, not saved in Git)
```

## Not built yet

- SMS, WhatsApp and app notifications are **simulated**: printed in the terminal and saved
  in the `notifications` table. Real sending comes in Step 9.
- Limiting repeated wrong guesses of passwords and pairing codes ("rate limiting") comes in Step 9.
