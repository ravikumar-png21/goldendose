# GoldenDose — User Testing Script

*For you to run with one older person. About 30 minutes. No technical knowledge needed.*

## Why this matters

Automatic tests prove the app **works**. Only watching a real person proves it's **easy**.
Professionals find that watching just 5 people reveals most of the problems in a design.
Even one session will teach you something no test can.

---

## Before the session (15 minutes)

**1. Get the app onto a phone or tablet.** It must be on the **same Wi-Fi** as your Mac.

- On your Mac, make sure the backend is running (the "GoldenDose backend" terminal tab).
- Find your Mac's address: **System Settings → Wi-Fi → Details** (next to your network) → **IP address**.
  It looks like `192.168.43.84`.
- On the phone, open the browser and type: `http://192.168.43.84:3000` (use your Mac's number).
- If your Mac asks "Allow node to accept incoming network connections?", click **Allow**.

**2. Set it up as Priya would.** On your Mac (or your own phone), open `http://localhost:3000/care/`,
sign in as `priya@example.com` / `goldendose-demo`, and either use Kamala or add a new person
with the participant's first name. Tap **Get a connection code** and type it on the test phone.

**3. Add a medicine due during the session.** In the caregiver app, add a medicine timed for about
10 minutes after the session starts, with an instruction such as "Take one white tablet with water".
Take a photo of a real strip if you have one.

**4. Prepare:** a notebook, the test phone at full brightness and volume, and a quiet room.

---

## What to say at the start (read it out)

> "Thank you for helping. I'm testing an app, not you. You can't do anything wrong.
> If something is confusing, that's the app's fault, and it's exactly what I need to find.
> Please say out loud what you're thinking as you go, even small things like 'I'm not sure what this means'.
> I may not answer your questions straight away, because I want to see what you'd do on your own."

**Then the golden rule: don't help, don't point, don't explain.** If they're stuck for more than a minute,
ask *"What would you do if I wasn't here?"* Only help after that, and write down that you helped.

---

## The tasks

Give one task at a time. Read it out exactly. Don't name buttons or say where to tap.

| # | Say this | Watch for |
|---|---|---|
| 1 | "Look at this screen. What do you think it's showing you?" | Do they understand it's *today's* medicines? Can they read everything without glasses, or with them? |
| 2 | "Which medicine is next, and when?" | Do they spot the highlighted card? |
| 3 | "Can you find out what this medicine is for, or how to take it, without reading?" | Do they find **Read aloud**? Can they hear it? |
| 4 | *(Wait for the alarm.)* "Please do what you'd normally do." | Do they notice it? Do they understand it? How long until they tap **Taken**? Do they hesitate between Taken and Skip? |
| 5 | "Imagine you pressed that by mistake. Can you fix it?" | Do they find **Undo**? |
| 6 | "It's later in the day and you can't remember if you took this one. How would you check?" | Do they understand the green tick and the time? |
| 7 | "Is there anything on this screen you'd be worried about pressing?" | Fears and doubts that tests can't see |

---

### Extra tasks for a family member (the new features)

| # | Say this | Watch for |
|---|---|---|
| F1 | "Open the app. Is anything wrong today?" | Do they read the **Needs attention** list first? Do they understand "Today" and "Worth a look"? |
| F2 | "What is each of your mother's medicines for?" | Do they find "For: …" on each medicine? |
| F3 | "You've just counted 20 tablets. When will you need to order?" | Do they find the medicine meter and the "Order by" date? |
| F4 | "The doctor visit is tomorrow. Show me what you'd bring." | Do they find the **Doctor visit report**? Can they print or share it? |
| F5 | "Keep a copy of this prescription." | Do they find **Prescriptions** and take a photo? |
| F6 | "Your brother changed a time. Find out what and why." | Do they find **Change history**? |
| F7 | "Ask the app how your mother did this week." | Do they find **Ask**? Do they trust the answer? |

## What to write down

For each task, note:

- ✅ Did it easily / ⚠️ Did it with difficulty / ❌ Couldn't do it / 🙋 Needed help
- **Exact words** they said, especially "Hmm", "Where's…", "I'm not sure…", "Oh, I see"
- Where they **tapped wrongly** or hesitated
- Anything they **squinted at, held closer, or asked about**

## Questions to ask at the end

1. "What was the easiest part?"
2. "What was the most confusing part?"
3. "Was anything too small, too quiet, or too fast?"
4. "Would you trust this to remind you? Why or why not?"
5. "If you could change one thing, what would it be?"

---

## After the session

Send me your notes, copied straight from the notebook without tidying them up. Raw notes are the most useful.
We'll sort the findings into:

- **Must fix:** they couldn't do a task, or could make a dangerous mistake
- **Should fix:** they managed, but struggled or hesitated
- **Nice idea:** suggestions for later

Then we fix the must-fix items and run the automatic tests again before Step 9.
