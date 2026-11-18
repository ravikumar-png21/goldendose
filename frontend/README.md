# GoldenDose frontend

The screens people use (Step 7). Plain HTML, CSS and JavaScript, with no build step.
The backend serves these files, so start it first (`npm run dev` in `backend/`), then open:

| Address | App | Who uses it |
|---|---|---|
| http://localhost:3000/ | Kamala's app: pairing, Today, the alarm | The elder, on a phone or bedside tablet |
| http://localhost:3000/care/ | The caregiver app | Family members (demo: priya@example.com / goldendose-demo) |

## Files

```
index.html, elder.css, elder.js   Kamala's app
care/index.html, care.css, care.js the caregiver app
shared/tokens.css                  colours, font and sizes from docs/DESIGN-SYSTEM.md
shared/api.js                      the one place that talks to the backend
shared/ui.js                       pill drawings, time formatting, esc() for safe text
```

## How Kamala's app keeps working without internet

- The last medicine list is saved on the device, so the alarm still rings offline.
- A "Taken" tapped offline is saved on the device and sent when the internet returns.
  (Known limit: the backend records the time it receives the tap, not when it was made.)

## Known limits of the web version

- The alarm only rings while the app is open on screen. A browser can't wake a locked phone.
  The Android and iPhone app version (after the web app goes live) adds a real lock-screen alarm.
- Browsers need one tap before they're allowed to play sound, so Kamala's app asks for it.
