# GoldenDose

A medicine reminder for older adults, with a family app for caregivers.

## Run it

You need Node.js 24 or newer. From this folder:

| Command | What it does |
|---|---|
| `npm run demo` | **For presentations.** Resets to demo data, starts the app, sets an alarm 5 minutes ahead (`npm run demo -- --alarm-in 10` for 10) |
| `npm start` | Starts the app without resetting data |
| `npm test` | Runs all the automatic tests (backend, then browser and accessibility) |

Then open:

- **Family app:** http://localhost:3000/care/ (demo: `priya@example.com` / `goldendose-demo`)
- **Elder's app:** http://localhost:3000/ (pair it with a code from the family app)

First time on a new computer: run `npm install` inside `backend/` and inside `e2e/`,
then `npx playwright install chromium` inside `e2e/`.

## Folders

| Folder | What's in it |
|---|---|
| `docs/` | Requirements, UX flows, design system, data and API design, test plan, user-testing and demo scripts |
| `prototype/` | The clickable prototype from Step 3 (works with no backend) |
| `frontend/` | The real screens: the elder's app and the family app |
| `backend/` | The API, database and missed-dose check |
| `e2e/` | Browser and accessibility tests |
| `scripts/` | The demo starter |
