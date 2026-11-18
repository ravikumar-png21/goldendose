# GoldenDose — Test Plan

*Step 8 of 10: how we prove the app does what the requirements say.*

## Three kinds of testing

| Kind | What it checks | How to run | Count |
|---|---|---|---|
| **Backend tests** | Every API rule: sign-in, access, double taps, undo window, missed doses, alerts, photos | `cd backend && npm test` | 162 |
| **Browser tests** (end-to-end) | A robot uses the real screens like a person: taps, types, checks what appears | `cd e2e && npm test` | 36 |
| **Accessibility checks** | Screen readers, contrast, labels, keyboard. Kamala's screens at the strictest level (WCAG AAA, 7:1 contrast) | included in `cd e2e && npm test` | 3 scans, 7 screens |
| **User testing** | Whether a real older person can actually use it | by you: see [USER-TESTING.md](USER-TESTING.md) | — |

Automatic tests catch **bugs**. Only real people catch **confusion**. We need both.

## Every requirement, and the test that proves it

| Requirement | Proven by |
|---|---|
| E1 One screen, today's medicines in time order | Browser: *E1: Today lists medicines in time order…* |
| E2 Big "Taken" button | Browser: *E5, E2, E3…* and *Design rule: main buttons at least 72px…* |
| E3 Green tick and "Taken at 8:15 am" | Browser: *E5, E2, E3…* |
| E4 Undo for 5 minutes | Browser: *E4: Undo puts the dose back…*. Backend: *Undo works within 5 minutes*, *Undo is refused after 5 minutes* |
| E5 Full-screen alarm when due | Browser: *E5, E2, E3: the alarm rings when due…* |
| E6 Alarm repeats every 5 minutes | Prototype check (pretend clock). Web version: manual check in user testing |
| E7 Photo of the pill | Backend: *a photo of the pill can be uploaded and then viewed*. Manual: take a real photo |
| E8, E9 Read aloud | Manual: listen on a real phone (robots can't judge speech) |
| C1 Caregiver adds, edits, stops medicines | Browser: *C1: adding a medicine…*, *C1: stopping a medicine…* |
| C2 From the caregiver's own phone | Browser: the whole caregiver suite runs in a phone-sized screen |
| C3 Message after 30 minutes | Backend: *at 30 minutes late, the dose is missed and every caregiver is told their way* |
| C4 History | Browser: *C4: history shows the last 7 days…* |
| C5 Several elders per caregiver | Browser: *C5: Priya sees everyone…*. Backend: *Priya can also look after a second elder* |
| C6 Several caregivers per elder | Backend: *after Priya invites Arjun, Kamala has two caregivers*. Browser: *C6…* |
| C7 Choose SMS / WhatsApp / app | Browser: *C7: Priya changes how she's alerted…*. Backend: *…every caregiver is told their way* |
| Readability: 24px+, 7:1 contrast | Accessibility: strictest-level scans of Kamala's screens |
| Touch: 64–72px buttons | Browser: *Design rule: main buttons at least 72px…* |
| No long press / double tap | Browser: the robot waits 0.9s between taps because quicker taps are ignored |
| Reliability: works without internet | Browser: *Reliability: a tap made without internet is kept and sent…* |
| Small screens | Browser: *nothing is cut off… on a small phone (320px wide)* and *on a short screen the alarm still shows the full pill picture* |
| Privacy: only linked family can see | Backend: *a stranger can't see Kamala's medicines*, *a caregiver's token can't be used as Kamala's phone* |
| Security: typed text can't run as code | Checked by hand in Step 7 (a medicine named with hidden code was shown as plain text) |

## Bugs found by testing (and fixed)

| Found by | Bug | Fix |
|---|---|---|
| Browser test | A wrong password on the caregiver sign-in showed **no message at all** | 401 on the sign-in screen now shows "Email or password is wrong." |
| Planning the tests | After Undo, the alarm rang again **instantly**, which feels like being told off | It now waits the usual 5 minutes |
| Checking the demo video | On short screens the alarm **squashed the pill picture** to a thin line | The alarm now scrolls instead; a browser test checks the picture stays full size |
| Manual test (Step 7) | Pairing box showed grey "000000", which looked already filled in | Removed |
| Manual test (Step 7) | A failed photo upload, then Save again, created a **duplicate** medicine | The form now remembers the saved medicine |

## When to run the tests

After **every** change, before saving a Git snapshot. If a test fails, fix it before moving on.
In Step 9, a service can run them automatically every time code changes ("continuous integration").
