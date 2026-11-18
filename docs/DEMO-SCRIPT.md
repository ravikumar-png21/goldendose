# GoldenDose — Demo Script

*A 15-minute live demo on your Mac. It shows what the app does AND how it works behind the scenes.*

---

## The day before

- [ ] Do a **full practice run** with this script, out loud, with a timer.
- [ ] Charge the Mac. Bring the charger.
- [ ] If presenting on a projector or TV, test the connection (screen mirroring or cable).
- [ ] Optional: get a phone or tablet ready to show Kamala's app on a real device (same Wi-Fi as the Mac).
- [ ] Optional: a photo of a real medicine strip on the Mac, to upload during the demo.

## 15 minutes before

1. **Turn on Do Not Disturb** (Control Centre → Focus), so no messages pop up.
2. **Volume up**: the alarm chimes and speaks.
3. **Close other apps and Safari tabs.**
4. **Start the demo** in the Terminal, from the medstracker folder:
   ```
   npm run demo -- --alarm-in 10
   ```
   This resets the data and sets Kamala's alarm for **10 minutes from now**. Note the time it prints (⏰).
   Use a number that lands the alarm about 7 minutes into your demo.
5. **Arrange the screen** into three parts:
   - **Left:** Safari window with Priya's app, `http://localhost:3000/care/`, signed in as `priya@example.com` / `goldendose-demo`
   - **Right:** a second Safari window with Kamala's app, `http://localhost:3000/` (showing the pairing screen)
   - **Bottom:** the Terminal showing the API requests
6. In Safari, press **Cmd +** a few times so text is readable from across the room.

---

## The demo (≈15 minutes)

### 1. The problem (1 min). No clicking.

> "Older people forget doses, mix up pills, or can't remember whether they've taken one.
> Their families have no way of knowing. GoldenDose fixes both sides:
> a very simple app for the elder, and a family app for the caregiver."

> "Before writing code, I spoke to an older person and wrote down six real problems:
> small text, wrong taps, missed reminders, getting lost, forgetting, and needing help.
> Every design decision you'll see comes from that list."

### 2. Priya sets up (3 min). Left window.

1. Show **Hello, Priya**: "She looks after both her parents. One caregiver, several elders."
2. Open **Kamala**. Point out today's list:
   > "This morning's doses say **Missed** in red. The system noticed, and Priya was alerted."
3. **Point at the Terminal**: the `[SMS → Priya]`, `[WHATSAPP → Priya]`, `[APP → Arjun]` lines.
   > "Each family member chooses how they're told. Priya wants SMS, WhatsApp and app.
   > Her brother Arjun only wants app notifications. These are simulated today.
   > Real messages need a messaging provider, which is the next stage."
4. Tap **Add a medicine** and show the form (no need to save):
   > "The instruction is read aloud to Kamala, so we ask Priya to mention the colour.
   > The photo matters most: people recognise medicine by how it looks, not by its name."
   Go back.

### 3. Connecting Kamala's phone (2 min). Both windows.

1. Left: **Get a connection code**.
2. Right: type the code in Kamala's app → **Connect**.
   > "Kamala never needs a password. Her daughter sets it up once, and the phone is remembered.
   > Passwords are one of the biggest barriers for older users."
3. **Click once anywhere** in Kamala's app (this allows sound).
4. Point at the **Terminal**: `POST /api/devices/pair → 201`, then `GET /api/today → 200`.
   > "That's the frontend asking the backend for today's medicines, through the API."

### 4. Kamala's screen (2 min). Right window.

Point out, without rushing:
- Text **twice normal size**, in a typeface designed for low vision (the 0 has a slash, so it can't be mistaken for O)
- **One screen**, medicines in **time order**, the next one highlighted
- Missed doses say **"Not taken yet"** in calm brown. *"We never show her the word 'missed' in red. That causes worry. The family sees it, because they need to act."*
- Tap **Read aloud** on a card.

### 5. The alarm (3 min). The highlight.

Talk over the wait if needed (see "If you have time to fill" below). When the alarm rings:

> "This is the most important feature. Not a small notification that's easy to swipe away,
> but a full-screen alarm with the pill's picture, and it speaks the instruction."

1. Let it ring for a few seconds. Then tap **Taken**. **Well done**, and a green tick: *"Taken at 7:24 pm"*.
   > "If she opens the app later and can't remember, the answer is right there."
2. Tap **Undo**: *"Mistakes are cheap to fix, so she's never afraid of the app."*
   Then tap **Taken** twice quickly: *"The second tap is ignored. That protects against shaky hands."*
3. Point at the Terminal: `POST /api/doses → 201`, `DELETE /api/doses/… → 204`, then one more `POST /api/doses → 201`.
4. Left window: reload Priya's page (**Cmd + R**). Calcium shows **Taken**.
   > "The same moment, on the daughter's phone."

### 6. Behind the scenes (3 min). Terminal.

Open a **new Terminal tab** (Cmd + T) and run:
```
cd backend && npm run peek
```
> "This is the actual database. Every dose is one row: what, when, and who recorded it.
> 'System' means the backend marked it missed by itself, after 30 minutes."

Then explain the five parts. It's worth having the reference page open:
<https://claude.ai/artifact/GhFvAdXjoxPmz6wUQEf1mR>

| Part | One sentence |
|---|---|
| Frontend | The two apps you just saw: HTML, CSS and JavaScript in the browser |
| API | The fixed list of requests scrolling in the terminal, like `POST /api/doses` |
| Backend | Node.js. Checks every rule (undo only 5 minutes, no double counting, family-only access) and runs the missed-dose check every minute |
| Database | SQLite now, one file. PostgreSQL when it goes online |
| Hosting | Today it runs on this Mac (`localhost`). Next step: a hosting service with a real web address |

Then run the automatic tests, if time allows (they take about a minute; start them while you talk):
```
npm test
```
> "56 automatic tests check every requirement after every change, including an accessibility
> scan at the strictest international level."

### 7. What's next (1 min)

> "To put it in real people's hands, there are three things left:
> putting it online with a real web address, sending real SMS and WhatsApp messages,
> and turning it into Android and iPhone apps, so the alarm works even when the phone is locked.
> Those involve accounts and small monthly costs, and I'd like your go-ahead on them."

---

## If you have time to fill while waiting for the alarm

- Open **Last 7 days** in Priya's app: yesterday's missed Vitamin D shows there.
- Open **Alerts and family**: show the SMS / WhatsApp / App choices and the invite form.
- Show [docs/REQUIREMENTS.md](REQUIREMENTS.md) and [docs/USER-TESTING.md](USER-TESTING.md): *"This is the process: requirements, design, build, test with real people."*

## If something goes wrong

| Problem | Fix |
|---|---|
| A page says "can't connect" | The backend stopped. In the Terminal: `npm run demo` (it resets and restarts) |
| "GoldenDose is already running" | An old copy is running. Click in its Terminal tab, press **Ctrl + C**, try again |
| The alarm has no sound | Click once anywhere in Kamala's app, then check the Mac's volume |
| The alarm didn't ring | Kamala's app must be **open and visible**. Check the ⏰ time in the Terminal. Reload her page (Cmd + R) |
| The pairing code expired | Codes last 10 minutes. Tap **Get a new code** |
| You need the alarm right now | Stop (Ctrl + C) and run `npm run demo -- --alarm-in 2`, then pair again |
| Nothing works at all | Open `prototype/index.html` by double-clicking it in Finder. It's the clickable design and works with no backend. Use its "Ring the next alarm now" button |

## Likely questions from your boss

**"How much will it cost to run?"**
Locally: nothing. Online: hosting typically starts free to a few hundred rupees a month at this size.
SMS and WhatsApp cost a small amount per message. App notifications are free. We'll compare exact options before deciding.

**"Is it secure? This is health information."**
Passwords are never stored, only scrambled. Every request is checked so families only see their own people.
Typed text can't be used to inject code. Going online adds the HTTPS padlock (encryption) and limits on password guessing.

**"Does it work on iPhone?"**
The web version works in any phone browser today. The phone-app version uses Android's full-screen alarms and Apple's AlarmKit (iOS 26+) for lock-screen alarms.

**"What if the internet is down?"**
Reminders still ring, because the medicine list is saved on the phone. Taps made offline are kept and sent automatically when the internet returns.

**"Has a real older person used it?"**
Answer honestly. If you've run the session in USER-TESTING.md, share what you learned. If not:
*"That's the next step. Here's the script I'll use."*

**"How long did this take, and what did you learn?"**
Walk through the 10 steps on the reference page. Steps 1–8 are done.
