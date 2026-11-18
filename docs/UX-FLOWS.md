# GoldenDose — UX Flows

*Step 2 of 10: UX design. How each person moves through the app, step by step.*

A **user journey** is a short story of someone using the app to get one thing done.
For each journey we ask: *what could go wrong here, and how does the design prevent it?*

---

## Journey 1 — Kamala takes her morning pill (the everyday path)

| Step | What Kamala does or sees | Design decision and why |
|---|---|---|
| 1 | At 9:00 the phone rings loudly and the alarm fills the screen. | She doesn't need to find or open the app. The app comes to her. |
| 2 | She sees a photo of the pink tablet and hears "Amlodipine. Take one pink tablet." | She recognises pills by how they look, and hearing the words helps when reading is hard. |
| 3 | She taps the big **Taken** button. | One very large button, placed low on the screen where a thumb reaches easily. |
| 4 | The screen shows a big green tick and "Taken at 9:02 am", then returns to Today. | Clear proof it worked. No guessing. |

**What could go wrong?** She doesn't hear it. → It repeats every 5 minutes (Journey 3).

---

## Journey 2 — Kamala presses "Taken" by mistake

| Step | What happens | Design decision and why |
|---|---|---|
| 1 | Her finger brushes **Taken** on the evening pill in the morning. | Upcoming doses can't be marked until 60 minutes before they're due, so this mistake mostly can't happen. |
| 2 | If it does happen on a due pill, the card shows "Taken at 9:02 am" with an **Undo** button. | Undo is visible for 5 minutes. No hidden menus. |
| 3 | She taps **Undo**. The card goes back to "Due now". | Mistakes are cheap to fix, so she isn't afraid of the app. |

**Rule:** no actions happen on long press, double tap or swipe. A single tap is the only gesture.

---

## Journey 3 — Kamala misses the alarm

| Time | What happens |
|---|---|
| 9:00 | Alarm rings for 1 minute. No answer. |
| 9:05 | Alarm rings again. |
| 9:10 – 9:25 | Repeats every 5 minutes. |
| 9:30 | The dose is marked **missed**, and Priya (caregiver) gets a message: "Kamala hasn't taken Amlodipine (due 9:00 am)." |
| Later | If Kamala opens the app, the card gently says "Not taken yet" with a **Taken** button, so she can still record it. |

**Design decision:** the elder never sees the word "missed" in red. That would cause worry. The caregiver sees it, because they need to act.

---

## Journey 4 — "Did I already take it?"

Kamala opens the app at 11:00 and can't remember.

- The Today screen shows the 9:00 pill with a **big green tick and "Taken at 9:02 am"**.
- She has her answer in under 2 seconds without tapping anything.

**Design decision:** the Today screen is always the first and only screen she sees. Doses are in time order:
done ones at the top (green), the next one highlighted, later ones below (quieter).

---

## Journey 5 — Priya adds a new medicine (caregiver)

| Step | What Priya does |
|---|---|
| 1 | Opens GoldenDose on her own phone and signs in. |
| 2 | Chooses **Kamala's medicines → Add medicine**. |
| 3 | Fills in: name, dose, times, instruction ("after food"), pill colour and shape. |
| 4 | Takes a photo of the strip with her camera. |
| 5 | Saves. Kamala's phone updates automatically. |

**Design decision:** setup is the caregiver's job, so the elder's app has no settings to get lost in.

---

## Screen map

```
ELDER'S PHONE                     CAREGIVER'S PHONE
─────────────                     ─────────────────
 ┌──────────┐                      ┌──────────────┐
 │  Today   │◄── always opens here │  Sign in     │
 └────┬─────┘                      └──────┬───────┘
      │ (dose due)                        │
 ┌────▼─────┐                      ┌──────▼───────┐
 │  Alarm   │  full screen         │ Medicine list│──► Add / edit medicine
 └──────────┘                      └──────┬───────┘
                                          │
                                   ┌──────▼───────┐
                                   │   History    │
                                   └──────────────┘
```

The elder's side has **2 screens**. That's the whole app for her.
