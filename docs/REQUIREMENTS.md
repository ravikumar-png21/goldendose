# Medicine Tracker — Requirements (v1)

*Step 1 of 10. Status: approved.*

## 1. The problem in one sentence

Older adults forget, mix up, or can't confirm their medicines, and their families
have no easy way to know when something has gone wrong.

## 2. Who uses the app

| Person | Who they are | What they need |
|---|---|---|
| **The elder** (main user) | 70+, weaker eyesight, less steady hands, not confident with phones | To be reminded, take the right pill, and know it's done |
| **The caregiver** | Son, daughter, nurse, or neighbour | To set up the medicines and be told if a dose is missed |

## 3. User stories

A *user story* is a requirement written from the person's point of view:
"As a ___, I want ___, so that ___." Each one has a priority:

- **Must** = the app is useless without it
- **Should** = important, build it if at all possible
- **Later** = good idea, not in version 1

### The elder

| # | User story | Priority |
|---|---|---|
| E1 | As an elder, I want **one screen showing today's medicines in time order**, so I never get lost. | Must |
| E2 | As an elder, I want a **big "Taken" button** on each medicine, so marking it is easy. | Must |
| E3 | As an elder, I want a finished dose to show a **big green tick and "Taken at 8:15 am"**, so I can tell at a glance that I took it. | Must |
| E4 | As an elder, I want to **undo "Taken" for 5 minutes**, in case I pressed it by mistake. | Must |
| E5 | As an elder, I want a **loud, full-screen alarm** when a dose is due, so I can't miss it. | Must |
| E6 | As an elder, I want the alarm to **repeat every 5 minutes** until I press "Taken" or "Skip". | Must |
| E7 | As an elder, I want to **see a photo of the pill or strip**, because I recognise medicine by how it looks. | Must |
| E8 | As an elder, I want a **"Read aloud" button** that speaks the name, dose and instruction ("Take one white tablet after food"). | Should |
| E9 | As an elder, I want the alarm to **speak the instruction automatically**. | Should |

### The caregiver

| # | User story | Priority |
|---|---|---|
| C1 | As a caregiver, I want to **add, edit and stop medicines** (name, dose, times, instruction, photo). | Must |
| C2 | As a caregiver, I want to **do this from my own phone**, without being in the same house. | Must |
| C3 | As a caregiver, I want a **message if a dose is missed for 30 minutes**, so I can call and check. | Must |
| C4 | As a caregiver, I want to **see a history** of taken, skipped and missed doses. | Should |
| C5 | As a caregiver, I want to **look after more than one elder** (for example both parents). | Must |
| C6 | As an elder, I want **more than one caregiver** (for example my daughter and my son) to be linked to me. | Must |
| C7 | As a caregiver, I want to **choose how I'm told** about a missed dose: SMS, WhatsApp, app notification, or any mix. | Must |

### Added on 17 October 2026 (from the caregiver research, docs/CAREGIVER-FEATURES.md)

| # | User story | Priority |
|---|---|---|
| E10 | As an elder, I want an **emergency button** that tells my whole family at once (with where I am, if I allow it) and lets me call the ambulance (108) or our hospital in one more tap. | Must |
| E11 | As an elder, I want my app **in my own language**: Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada or Malayalam (or English). | Must |
| C8 | As a caregiver, I want a **medicine meter**: I count the tablets once, and I'm told when about 5 days are left. | Must |
| C9 | As a caregiver, I want to **order from our own chemist on WhatsApp** in one tap, with the list already written. | Should |

C3 (a message when a dose is 30 minutes late) already covers "tell me if she hasn't taken it after half an hour".

## 4. Design rules (non-functional requirements)

These describe *how well* the app must work, not *what* it does.

**Readability**
- Body text at least 24px, which is about twice the normal phone size. Medicine names 32px or more.
- Contrast at least 7:1 (the strictest accessibility level, called WCAG AAA). Dark text on a plain light background.
- No meaning carried by colour alone: a green tick always comes with the word "Taken".

**Touch**
- Buttons at least 64px tall, with at least 24px of space between them.
- At most 2–3 buttons per screen.
- Long press, double tap and swipe gestures do nothing.

**Simplicity**
- The elder's side of the app is basically one screen.
- Setup and editing live in a separate caregiver area that the elder never needs to open.

**Reliability**
- Reminders must still fire **when there is no internet**. This means the alarm schedule
  is stored on the elder's device, not only on the server.
- Nothing is lost if the phone restarts.

**Privacy**
- This is health information. Only linked family members can see it.
- All traffic is encrypted (HTTPS).

## 5. Not in version 1 (out of scope)

Writing down what we will *not* build matters just as much. It stops the project growing forever.

- Drug interaction warnings
- Pharmacy refills and ordering
- Smartwatch support
- ~~Languages other than English~~ (added 17 October 2026: E11)

## 6. How we'll know it works (acceptance criteria)

Each Must story gets a test written as *Given / When / Then*. Two examples:

> **E4 — Undo**
> **Given** I marked Metformin as taken at 8:15,
> **When** I tap "Undo" at 8:17,
> **Then** the dose goes back to "Due" and the caregiver's history shows no record of it being taken.

> **C3 — Missed-dose alert**
> **Given** Amlodipine was due at 9:00 and has not been marked,
> **When** the clock reaches 9:30,
> **Then** the caregiver receives the message "Kamala hasn't taken Amlodipine (due 9:00 am)."

## 7. Decisions (agreed 12 October 2026)

1. **Name:** GoldenDose. (The first name, DoseBuddy, was renamed on 16 October 2026: another medicine app already uses it on the app stores.)
2. **Web app first.** Built with HTML, CSS and JavaScript so every layer is easy to see and learn.
   In the browser the alarm rings while the app is open (for example on a bedside tablet).
3. **Then Android and iPhone.** The same code is wrapped as a phone app (using a tool called Capacitor).
   That stage adds the real lock-screen alarm:
   - Android: full-screen alarm notifications.
   - iPhone: Apple's AlarmKit (iOS 26 and later), which lets an app ring like the built-in Clock alarm.
4. **Caregivers and elders are many-to-many.** One caregiver can look after several elders,
   and one elder can have several caregivers.
5. **Missed-dose messages go by SMS, WhatsApp or app notification**, chosen by each caregiver.
   App notifications are free. SMS and WhatsApp cost a small amount per message and need an
   account with a messaging provider. That account is set up at deployment (Step 9).
6. **The prototype is approved** as the basis for the real elder screens.
