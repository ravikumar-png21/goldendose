// Everything said in the GoldenDose videos, one entry per picture, read by Emma (Kokoro), warm and unhurried.
// Short sentences, plain words, spoken to the viewer like a friend. Change any words freely, then make the video again.
//
//   id      the name of the picture and the recording (keep it unique)
//   picture where the picture comes from:
//             { pdf: 3 }                      page 3 of docs/fullvideo/Why-GoldenDose.pdf
//             { title, sub }                  a plain title card
//             { live, phone, film }           filmed live in the real apps by 3-film.js (film: which filming),
//                                             with this heading, on Priya's ("family") or Kamala's ("elder") phone
//             { click: "c07" }                that slide from the click-by-click guide
//   say     what Emma says

const why = [
  { id: "welcome", picture: { title: "Welcome, Team Tensor", sub: "Dhiraj Singh · Kislay Singh · Keshab Singh" }, say: "Hello Dhiraj, Kislay and Keshab, and everyone at Team Tensor. Thank you so much for making the time. In the next few minutes, I'd love to show you something we've built with a lot of care." },
  { id: "why01", picture: { pdf: 1 }, say: "This is GoldenDose: a medicine reminder that older people can actually use, and that families can truly rely on. Let me start with why we made it." },
  { id: "why02", picture: { pdf: 2 }, say: "So many of our parents take several medicines every day, and keeping track is genuinely hard. A small phone reminder is easy to miss. Lots of pills look alike. And sometimes they simply aren't sure: did I take it already? So they skip it, or take it twice." },
  { id: "why03", picture: { pdf: 3 }, say: "And the family worries, often from far away, in another city or another country. You can't see whether Amma took her pills today. You usually find out late. So you keep calling to check, and that's tiring for everyone." },
  { id: "why04", picture: { pdf: 4 }, say: "So the app is for two people. Kamala takes several medicines, her eyesight isn't what it was, and phones make her nervous, but she wants to stay independent. And Priya, her daughter: busy, perhaps living far away. She sets things up, and she just wants to know her mother is all right, without calling all day." },
  { id: "why05", picture: { pdf: 5 }, say: "We began by quietly watching a real older person use a phone. The text was too small. Buttons were easy to miss. Reminders got missed, and that was the biggest problem of all. Too many menus. No easy way to check, did I take it? And nobody in the family knew when a dose was missed." },
  { id: "why06", picture: { pdf: 6 }, say: "So GoldenDose is one reminder, with two apps. Kamala's app reminds her, shows her the right pill, and remembers what she took. Priya's app is where the medicines are set up, and where she can keep a gentle eye on things from anywhere." },
  { id: "why07", picture: { pdf: 7 }, say: "It works in three simple steps. First, the family sets it up, just once: each medicine, its time, and a photo of the pill. Second, at the right time, the alarm fills Kamala's screen, shows the pill, and reads it out. She taps Taken. Third, if a dose is half an hour late, the family gets a message." },
  { id: "why08", picture: { pdf: 8 }, say: "For Kamala, that means she doesn't miss doses, because the alarm keeps going until she answers. She takes the right pill, because she sees it and hears its name, and now she even hears what it's for. She can always check, with a green tick and the time. And nothing is frightening: big text, one screen, no password, and an Undo button." },
  { id: "wm-alarm", picture: { live: "The alarm comes to her", phone: "elder", film: "moments" }, say: "Here's what that looks like on Kamala's phone. The alarm fills the screen, shows her pill, and reads it out. She takes it, and taps Taken. That's all." },
  { id: "why09", picture: { pdf: 9 }, say: "For the family, it's peace of mind. You see today at a glance. You only get a message when something's actually wrong. You can change medicines from your own phone. And brothers and sisters can share the care." },
  { id: "wm-connected", picture: { live: "Peace of mind, by itself", phone: "family", film: "moments" }, say: "And on Priya's phone: the moment Kamala's phone is connected, her setup turns green, all by itself. No calls to check, no guessing." },
  { id: "why10", picture: { pdf: 10 }, say: "And now, everything the family needs is in one place. A Needs attention list, with the most important things first. A doctor visit report you can print or share on WhatsApp. Every prescription, kept safe. What each medicine is for. A refill reminder that knows your own chemist. Gentle notes when a pattern changes. Blood reports, with reminders when a result should go to the doctor or the next test is due, and a home sample collection booked in one tap. Blood pressure, weight and sugar. A history of who changed what. And Ask GoldenDose, where you can simply ask, how did Amma do this week? It answers from her records, and it never gives medical advice." },
  { id: "why11", picture: { pdf: 11 }, say: "Compared with a normal phone reminder: that's a small note you can swipe away. GoldenDose takes the whole screen. A normal reminder just shows a name. GoldenDose shows a picture and reads it out. If a dose is missed, normally nobody knows. Here, the family is told. And the family sets it up, not the older person." },
  { id: "why12", picture: { pdf: 12 }, say: "The idea behind all of it is simple. Simple for the elder, and peace of mind for the family. One screen. Big and clear. The alarm comes to her. Mistakes are easy to undo. Nothing frightening. And the family always has her back." },
  { id: "why13", picture: { pdf: 13 }, say: "So, where are we now? Both apps are built and tested, and they run on my laptop. Next, we try it with five older people, then put it online. After that come Android and iPhone apps, with real alerts. Thank you. Now, let me show you how it feels the very first time you use it." },
];

const firstTime = [
  { id: "ft01", picture: { title: "Your first time with GoldenDose", sub: "A few minutes for Priya, two taps for Kamala" }, say: "Here's a quick tour, just like the one any app gives you the first time. This is the real app, being used. First, Priya sets things up on her phone. Then Kamala starts using hers." },
  { id: "ft02", picture: { title: "Priya, the family", sub: "Set up once, on your own phone" }, say: "Let's start with Priya." },
  { id: "ft03", picture: { live: "Create your account", phone: "family", film: "first-time" }, say: "Priya opens the family app, and taps Create an account. She types her name, her mobile number, her email, and a password. Then, Create account. And she's in." },
  { id: "ft04", picture: { live: "Add the person you look after", phone: "family", film: "first-time" }, say: "Her list is empty, so she adds the person she looks after. She types her mother's name, Kamala, and taps Add person. Kamala's own setup opens, with four simple steps." },
  { id: "ft05", picture: { live: "Add a medicine", phone: "family", film: "first-time" }, say: "Step two: Priya taps Add a medicine. The name, Calcium. The strength. A short instruction: take one orange tablet with water. And what it's for: bone strength. Kamala will hear all of this read out to her." },
  { id: "ft06", picture: { live: "Set the time, and how it looks", phone: "family", film: "first-time" }, say: "Then the time it should be taken. She picks the pill's shape and colour, so it matches the real tablet. A photo works too. And she taps Add medicine." },
  { id: "ft07", picture: { live: "Get a code for Kamala's phone", phone: "family", film: "first-time" }, say: "Step three: Kamala's phone. Priya taps Get a connection code. The setup shows exactly what to do on Kamala's phone: open the browser, type this address, then the six digits. The code works once, for fifteen minutes, so Kamala never needs a password." },
  { id: "ft08", picture: { live: "Choose how you're told", phone: "family", film: "first-time" }, say: "And step four. Priya chooses how she wants to hear about a missed dose: SMS, WhatsApp, or a notification in the app. She taps Save, and goes back to Kamala's setup, which is now waiting for her phone." },
  { id: "ft09", picture: { title: "Kamala, the elder", sub: "Nothing to learn: the phone does the remembering" }, say: "Now, Kamala. Her side is even simpler." },
  { id: "ft10", picture: { live: "Type the code, once", phone: "elder", film: "first-time" }, say: "On her phone, she types the six digits Priya gave her, and taps Connect. That's the only setup she ever does." },
  { id: "ft10b", picture: { live: "Connected, by itself", phone: "family", film: "first-time" }, say: "And on Priya's phone, the setup turns green all by itself: Kamala's phone is connected. No need to refresh, and no need to call and ask." },
  { id: "ft11", picture: { live: "When the alarm rings", phone: "elder", film: "first-time" }, say: "When it's time for a medicine, the alarm fills the whole screen, and shows the pill. She takes it, and taps the big Taken button." },
  { id: "ft12", picture: { live: "Well done", phone: "elder", film: "first-time" }, say: "A big green tick, and the time. Simple." },
  { id: "ft13", picture: { live: "Today's medicines", phone: "elder", film: "first-time" }, say: "This is her whole app. One screen, with today's medicines in big letters. If reading is hard, she taps Read aloud." },
  { id: "ft14", picture: { live: "Did I take it? One look", phone: "elder", film: "first-time" }, say: "Later, if she wonders, did I take it? The card is green, with the time. One look, and she knows." },
  { id: "ft15", picture: { live: "And Priya sees it too", phone: "family", film: "first-time" }, say: "And on Priya's phone, Calcium shows Taken, with the time. If a dose is ever missed, she gets a message. That's really the whole idea." },
];

// The click-by-click guide: every one of the 115 steps, in the guide's order.
// Picture: that slide from the click-by-click guide.
const clicks = {
  cover: "Now, the full guide, click by click. Every step, one at a time, in both apps, right up to the newest family records. Take it at your own pace.",
  legend: "On each slide, the red circle shows where to tap, and the badge says what to do: click, type, choose, call, or check.",
  sA: "Part A. Getting started. Priya creates her own family account. Her list starts empty.",
  c01: "Click one. Tap Create an account. It's for someone using GoldenDose for the first time.",
  c02: "Two. Type your name, Priya Sharma. It's shown in the app, and in alert messages.",
  c03: "Three. Your mobile number. Missed-dose texts go here.",
  c04: "Four. Your email. It's what you sign in with.",
  c05: "Five. Pick a password, at least eight characters.",
  c06: "Six. Tap Create account, and you're in. Hello, Priya. Her list is empty for now.",
  c07: "To sign out, tap Sign out, at the top right.",
  c08: "To sign in again, type your email.",
  c09: "Then your password. The dots hide what you type.",
  c10: "And tap Sign in. Still nobody on her list. So next, she adds her mother.",
  sB: "Part B. Adding Kamala, and her first medicine.",
  c11: "Type Kamala's name, the way she likes to be called.",
  c12: "Tap Add person.",
  c13: "And here she is: Set up Kamala. Four short steps, one at a time. Kamala is added, and next comes her first medicine.",
  c14: "Step two of the setup: tap Add a medicine. Keep the strip or the prescription next to you.",
  c15: "Type the medicine name. It's the only box you must fill in.",
  c16: "The strength, like five hundred milligrams.",
  c17: "The instruction. It's read aloud to Kamala, so mention the colour.",
  c18: "Then, what it's for, as the doctor said. Here, bone strength. Kamala's app shows it under the name, and reads it aloud. If you type a common name, like Glycomet or Telma, GoldenDose gently suggests what it's usually for.",
  c19: "Set the time the alarm should ring every day.",
  c20: "If a medicine is taken more than once a day, tap Add another time.",
  c21: "And Remove takes away a time you don't need. At least one time always stays.",
  c22: "Take or choose a photo of the pill or strip. It shows on her screen and on the alarm.",
  c23: "No photo? Pick a shape: round, oval, or capsule.",
  c24: "And the colour, so it matches the real tablet.",
  c25: "Tap Add medicine. Kamala's phone picks it up within a minute.",
  sC: "Part C. Connecting Kamala's phone.",
  c26: "Step three: Kamala's phone. Tap Get a connection code.",
  c27: "The setup shows exactly what to do on her phone: open the browser, type this address, then the six digits. The code works once, for fifteen minutes. Now, pick up Kamala's phone.",
  c28: "On her phone, type the six digits in the big box.",
  c29: "Tap Connect. The phone remembers her from now on.",
  c30: "And on Priya's phone, without touching a thing, the setup turns green: Kamala's phone is connected. At the bottom of Kamala's own list, it says she's connected to her family, with Priya's name.",
  c31: "Tap Finish. Kamala's page opens, with her phone connected.",
  sD: "Part D. Kamala's app.",
  c32: "Read aloud speaks the medicine's name and instruction.",
  c33: "When the alarm rings, she takes the pill, then taps Taken.",
  c34: "Well done. A big green tick, and the time.",
  c35: "If the doctor says not today, she taps Skip this dose. The alarm stops, and the family can see it in the history.",
  c36: "Tapped by mistake? Undo works for five minutes.",
  c37: "She can also tap Taken right on the card, without waiting for the alarm.",
  c38: "A green card means done, with the time it was taken.",
  sE: "Back on the family app: checking and managing.",
  c39: "All people, at the top left, goes back to everyone you look after.",
  c40: "Open Kamala again, to see the latest.",
  c41: "Today's list shows every dose with a word and a colour: taken, skipped, missed, due now, or later. The past weeks you'll see from here are example data, filled in for this guide.",
  c42: "Last 7 days shows every dose for the past week. Handy when the doctor asks.",
  c43: "Back to Kamala.",
  c44: "How you're told about missed doses is at the bottom of her page.",
  c45: "Tick the alerts you want: SMS, WhatsApp, or the app. Each family member picks their own.",
  c46: "Then tap Save.",
  c47: "To invite family, type their email. They need their own GoldenDose account first.",
  c48: "Choose what they can do. A helper can see and change medicines. A main caregiver can also invite others.",
  c49: "Then tap Invite.",
  c50: "Done. Meera can now see Kamala's medicines, and get alerts too.",
  c51: "Back to Kamala.",
  c52: "Tap any medicine to change its name, strength, instruction, times, photo, shape or colour.",
  c53: "If the doctor stops a medicine, tap Stop, at the bottom. It asks first.",
  c54: "Keep it cancels. Yes, stop it ends the reminders, and keeps the history.",
  sF: "Part F. Safety and supply.",
  meter: "First, how the medicine meter works. You count the tablets once, and type the number. After that, GoldenDose counts down by itself: every dose time that passes takes one dose away, even if Kamala forgot to tap Taken. For example, Telma, twice a day. Priya counts thirty tablets on Monday: that's about fifteen days. Ten days later, ten tablets are left, about five days, so a Running low box appears, and every family member gets one message. Order on WhatsApp writes a one month order, sixty tablets, to your own chemist. When the new strip comes, count again, and the meter starts fresh. It always says about, because it counts by the schedule, so recount now and then.",
  c55: "Now the clicks. Open the medicine, and find Medicine meter. Count the tablets in hand, and type the number. As you type, a line tells you how many days they'll last, and when to order.",
  c56: "Tap Save changes. The medicine now shows the days left, and an Order by date, so you're never caught short.",
  c57: "When about five days or less are left, a Running low box appears on Kamala's page, and the family gets one message. To order in one tap, the app needs your chemist. Open Language, hospital and chemist.",
  c58: "Choose Kamala's language. Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Malayalam, or English.",
  c59: "Type the hospital's phone number. Kamala's emergency button will offer to call it.",
  c60: "And your own chemist's WhatsApp number.",
  c61: "Tap Save. Kamala's phone changes to her language straight away.",
  c62: "Back to Kamala's page. The Running low box now has an Order on WhatsApp button.",
  c63: "Order on WhatsApp opens your own WhatsApp, with the order already written to your chemist: each running low medicine, and a month's supply. Check it. Nothing is sent until you press Send. When the medicine arrives, count the tablets again.",
  c64: "On Kamala's phone, now in Hindi, there's the emergency button. One tap tells the whole family at once.",
  c65: "Then she can call the hospital, or the ambulance on 108, or see the nearest hospitals on the map.",
  c66: "When help has come, or if it was a mistake, she taps I'm OK. The family is told that too.",
  c67: "On Priya's phone, a red banner shows when the button was pressed, and when Kamala said she's OK. Call her anyway, to check.",
  sG: "Part G. The family's records: the doctor visit report, prescriptions, the change history, the setup check, and Ask GoldenDose.",
  c68: "On Kamala's page, under Records and reports, tap Doctor visit report. It shows the last thirty days: what was taken, missed and skipped, for every medicine.",
  c69: "Print or save as PDF gives you a neat page to take to the doctor.",
  c70: "Or share a short summary on WhatsApp, with your brother, your sister, or the doctor. Nothing is sent until you press Send.",
  c71: "Back to Kamala.",
  c72: "Prescriptions keeps every prescription in one safe place. Only Kamala's family can see them.",
  c73: "Take a photo of the prescription, or choose one you already have, even a PDF.",
  c74: "Type the doctor's name.",
  c75: "And the date on the prescription.",
  c76: "Save details. Now it's always at hand, at the chemist or at the next visit.",
  c77: "Back to Kamala.",
  c78: "Change history shows every change to Kamala's medicines and settings.",
  c79: "Who made it, when, and why. So everyone sharing the care knows exactly what changed. And if you like, a helper's changes can wait for the main caregiver's OK.",
  c80: "Back again.",
  c81: "Setup check shows what's ready, and what's still to do.",
  c82: "A green tick for everything that's done. Anything else tells you how to finish it.",
  c83: "Back to Kamala.",
  c84: "And finally, Ask. Ask anything about Kamala's medicines, in plain words, in any language.",
  c85: "Let's try a ready-made question: what is each medicine for?",
  c86: "The answer comes straight from Kamala's records. For anything about doses or symptoms, it kindly points you to her doctor.",
  c87: "Close, and you're back on her page.",
  sH: "Part H. Health records.",
  c88: "Health records: blood reports, the tests the doctor wants repeated, blood pressure, weight, questions for the doctor, and the next visit. GoldenDose reminds you; the doctor decides.",
  c89: "It has already noticed that Kamala takes medicines for blood pressure and diabetes, and gently suggests regular checks.",
  c90: "Tap Add a blood report. Keep the paper report next to you.",
  c91: "Choose the test from the list, here HbA1c. The unit fills in by itself.",
  c92: "Type the result: eight point two.",
  c93: "Now the normal range printed on the report, next to that result: from four,",
  c94: "to five point six. GoldenDose always uses the lab's own printed range, never one of its own.",
  c95: "Save report.",
  c96: "Eight point two is above the printed range, so GoldenDose asks a simple question: has Kamala's doctor seen it? It stays on the list until you say yes, and the family gets one message.",
  c97: "Share with the doctor opens WhatsApp, with the results written out. Nothing is sent until you press Send.",
  c98: "Once the doctor has seen it, tap Doctor has seen it, and the reminder goes away.",
  c99: "How often does the doctor want this test? Every three months. GoldenDose works out the next date, and reminds you a week before, and again if it's overdue.",
  c100: "Blood pressure: choose how often to check, here every week,",
  c101: "and the target the doctor gave, one forty over ninety.",
  c102: "Save.",
  c103: "Now a reading from the BP machine. The top number, one sixty two,",
  c104: "and the bottom number, ninety five.",
  c105: "Save reading.",
  c106: "It's above the doctor's target, so GoldenDose suggests sharing the readings with the doctor. It never says what a reading means.",
  c107: "Questions for the doctor: anyone in the family can add one, whenever it comes to mind.",
  c108: "Add. They'll print with the doctor visit report, ready for the next visit.",
  c109: "Weight works the same way. Fifty eight point five kilos,",
  c110: "and Save. A big change in a month is flagged as worth telling the doctor. Blood sugar, just below, works the same way too.",
  c111: "Last, your own lab's WhatsApp number,",
  c112: "and Save.",
  c113: "Now, Book a home collection opens WhatsApp to your lab, listing the tests that are due, and asking for a day and time. Many labs in India come home for the sample.",
  c114: "Back to Kamala.",
  c115: "Finally, on a shared phone, tap Sign out when you're done. Kamala's phone stays connected.",
  end: "You've now seen every click. And the everyday routine is just three taps: the alarm rings, Kamala takes her pill, and taps Taken.",
};





// Everything else, filmed live: only what the first-time tour doesn't show.
const more = [
  { id: "mt01", picture: { title: "More things you can do", sub: "Everything else, in a few minutes" }, say: "Here are a few more things GoldenDose can do. First, on Kamala's phone." },
  { id: "mt02", picture: { live: "Not today? Skip it", phone: "elder", film: "more" }, say: "Sometimes the doctor says, don't take this one today. So when the alarm rings, Kamala taps Skip this dose." },
  { id: "mt02b", picture: { live: "Two at once? One after the other", phone: "elder", film: "more" }, say: "The alarm stops, and Priya can see it was skipped. And if another medicine is due at the same time, its alarm comes straight after, like this one." },
  { id: "mt03", picture: { live: "Pressed by mistake? Undo", phone: "elder", film: "more" }, say: "She takes this one, and taps Taken. But say she tapped it by mistake. There's Undo, for five minutes, and the medicine goes back to waiting." },
  { id: "mt04", picture: { live: "Taken, right from the card", phone: "elder", film: "more" }, say: "She doesn't have to wait for the alarm, either. When she's ready, she taps Taken right on the card, on her Today screen." },
  { id: "mt05", picture: { live: "Coming back later", phone: "family", film: "more" }, say: "Now, Priya's phone. When she comes back later, she signs in with her email and password. If she types the wrong password, it simply says so, and she tries again." },
  { id: "mt06", picture: { live: "Everyone you look after", phone: "family", film: "more" }, say: "Here's everyone she looks after: her mother, Kamala, and her father, Ramesh. She taps a name to open their page." },
  { id: "mt07", picture: { live: "Today, at a glance", phone: "family", film: "more" }, say: "Kamala's page shows today at a glance. Green means taken. Grey, skipped. Red means missed, and Priya was sent a message. Yellow is due now. And the rest are later today." },
  { id: "mt08", picture: { live: "Look back over the week", phone: "family", film: "more" }, say: "Last 7 days shows every dose for the past week: taken, skipped, or missed. Handy when the doctor asks." },
  { id: "mt09", picture: { live: "Change a medicine", phone: "family", film: "more" }, say: "To change a medicine, Priya just taps it. Say it's now taken twice a day. She taps Add another time, and sets the second time. A time she doesn't need? Remove takes it away. Then, Save changes. Kamala's phone updates within a minute." },
  { id: "mt10", picture: { live: "Stop a medicine", phone: "family", film: "more" }, say: "If the doctor stops a medicine, she opens it and taps Stop, at the bottom. It asks first, so nothing happens by accident. The reminders end, but the history is kept." },
  { id: "mt11", picture: { live: "Share the care", phone: "family", film: "more" }, say: "Brothers and sisters can help too. In Alerts and family, each person chooses their own alerts. To invite her sister Meera, Priya types her email. Meera needs her own GoldenDose account first. Then, what can she do? A Helper can see and change medicines. A Main caregiver can also invite others. And, Invite." },
  { id: "mt12", picture: { live: "All people, and sign out", phone: "family", film: "more" }, say: "To go back to everyone, tap All people, at the top. And on a shared phone, tap Sign out when you're done. Kamala's phone stays connected." },
  { id: "mt13", picture: { title: "Simple for the elder.", sub: "Peace of mind for the family." }, say: "And that's GoldenDose. Kamala hears the alarm, takes her pill, and taps Taken. Priya gets a message only if something's missed. Thanks for watching." },
];

// The ending: the whole idea once more, in the real apps, then what's next.
const closing = [
  { id: "close-elder", picture: { live: "Kamala takes her medicine", phone: "elder", film: "moments" }, say: "So, one last look at the whole idea. Kamala's alarm rings, she takes her pill, and taps Taken. A green tick, and the time." },
  { id: "close-family", picture: { live: "And Priya knows, far away", phone: "family", film: "moments" }, say: "And at that very moment, on Priya's phone, in another city, Calcium shows Taken. No phone calls, and no worry. GoldenDose only speaks up when something needs her." },
  // Suggested AI features: ideas for later, not built yet (slides ai0 to ai5 of the click guide)
  { id: "ai-0", picture: { click: "ai0" }, say: "Before we finish, a look further ahead. These are suggested features. None of them are built yet. The idea is AI that does the work for the family, and always asks first. It never gives medical advice." },
  { id: "ai-1", picture: { click: "ai1" }, say: "For the family: Priya photographs a prescription, and GoldenDose drafts the medicine list, the times, and what each one is for. She checks it, and approves. The same for a blood report. Before a doctor visit, a one page brief. After it, the new prescription turned into changes, waiting for her approval. And an agent that messages the chemist or the lab when it's time, and follows up." },
  { id: "ai-2", picture: { click: "ai2" }, say: "For Kamala: a voice companion she can ask, in Hindi or Tamil, did I take my morning tablet? A phone call at dose time, for elders without a smartphone. Press 1 for yes. And a camera check: is this the right tablet?" },
  { id: "ai-3", picture: { click: "ai3" }, say: "For the whole family: a warm weekly summary for the siblings' WhatsApp group. Shared tasks, like who's taking Amma to the doctor on Friday. And patterns in plain words, such as missed doses on fasting days, with a suggestion to move a reminder time. Never a medicine." },
  { id: "ai-4", picture: { click: "ai4" }, say: "And it would be safe by design. It asks before acting. It gives no medical advice. Everything goes into the change history. And the family's data stays private, with their consent." },
  { id: "ai-5", picture: { click: "ai5" }, say: "We'd build the prescription reader first, then the blood report reader, then the doctor visit assistant." },
  { id: "close-next", picture: { title: "What's next", sub: "Five real families · then online · then Android and iPhone apps" }, say: "What's next? We'd like to try GoldenDose with five real families. Then put it online, and build the Android and iPhone apps, so the alarm rings even on a locked phone. Thank you so much for watching, and take good care." },
];

const clickLines = Object.entries(clicks).map(([id, say]) => ({ id: `click-${id}`, picture: { click: id }, say }));

// The videos, and what's in each. Make one with:  npm run full-video -- <name>
export const videos = {
  // Why GoldenDose, the first-time tour, then every click of the guide (all 115), with the newest features
  full: { file: "GoldenDose-Full-Guide.mp4", lines: [...why, ...firstTime, ...clickLines, ...closing] },
  // Why GoldenDose, the first-time tour, then everything else, all filmed live: nothing repeated
  live: { file: "GoldenDose-Live-Guide.mp4", lines: [...why, ...firstTime, ...more] },
};

// Every line in any video, by id
export const allLines = Object.fromEntries(Object.values(videos).flatMap((v) => v.lines).map((l) => [l.id, l]));

// Which video a script should work on: the name after the script, or "full"
export function chosenVideo() {
  const name = process.argv[2] ?? "full";
  if (!videos[name]) throw new Error(`No video called "${name}". Choose one of: ${Object.keys(videos).join(", ")}`);
  return { name, ...videos[name] };
}
