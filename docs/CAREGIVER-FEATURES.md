# GoldenDose: what to build next

*A research summary for the GoldenDose team. It is written for India first: Indian families, Indian elders, Indian realities.*

---

## 1. The big picture

- **Most Indian elders cannot read the screen, in any language.** Only 39.6% of Indians over 60 can read, and among older women it is 24.2% (LASI, India's national ageing survey). About one in three also has weak eyesight even with glasses. Today GoldenDose reads medicines aloud in English. For most Kamalas that voice, not the screen, is how the app talks to her, so **the voice has to be in her language.**

- **"Not marked" usually does not mean "not taken".** In India's TB programme (99DOTS), patients recorded about 66% of their doses, but urine tests showed about 88% were really taken. Each alert today names a single medicine and says "missed", so families panic over silence that is often harmless. **Alerts should be calmer, combined into one per dose time, and more honest in their wording.**

- **Running out of medicine causes missed doses as often as forgetting does.** In rural West Bengal, elders gave irregular supply (72.3%) and cost (66.3%) as reasons for missing BP tablets. In Udupi, 55.6% of elders with both BP and diabetes did not take their medicines as prescribed, and cost and distance to a clinic were linked to this. **GoldenDose should help families buy medicines before they run out, not just remind elders to take them.**

- **The person who hands over the pills is often not Priya.** About 7 in 10 elders live with their children. In one HelpAge survey, 68% of daughters-in-law helped with medicines, as did many domestic helpers and spouses. About 1 in 4 elders has no child at home at all. **The app needs a place for whoever is actually standing next to Amma.**

- **Medicine changes are when things go wrong.** In one study, 96% of patients went home from hospital with at least one medicine change, but only 44% were told about it clearly. Carer mistakes cluster after dose changes. **The app needs a careful way to record "the doctor changed something" and to explain it to the family and to Amma.**

- **Phones fail silently.** Vivo, Samsung, Oppo, Xiaomi and Realme sell roughly 70% of new phones in India, and most of these brands shut down apps running in the background to save battery. Android 14 also limits exact alarms. **Families need to know the difference between "Amma didn't take it" and "her phone couldn't ring".**

- **Dignity matters as much as data.** In HelpAge's study, 56% of elders said disrespect was the most common way they were mistreated. Features that feel like spying on Amma will be resisted or quietly switched off.

## 1b. Indian elders' problems GoldenDose must solve

| Problem in Indian homes | What GoldenDose does about it |
|---|---|
| Only about 10% of Indians speak English, and cheap phones often have no Hindi or Tamil voice installed | **Family's own voice** (#1). Later, **Amma's language** on screen and in speech (#7) |
| Two or three small white tablets look alike, and elders recognise pills by colour and shape | **Picture instructions** (#4): drawn amounts, food pictures, which eye, half tablets |
| Medicine runs out at month end, the chemist cuts strips, salary day is far off | **Refill radar** (#3), with a ready WhatsApp message to the family's own chemist |
| A helper, daughter-in-law or spouse gives the dose, and the record wrongly says "Missed" | **"She took it" button** (#2). Later, **the helper's own phone** (#10) |
| A son or daughter abroad gets 12 pings at 11 pm for one breakfast | **One calm alert** per dose time, with "I'm on it" and an all-clear (#6) |
| Several specialists, 5 or more medicines (about half of older Indians), duplicate prescriptions in 35.8% | **Doctor-change review** (#8) and a **same-salt warning** (Now list) |
| Jan Aushadhi or a different brand makes the pill look different, and Amma refuses it or takes both | **"Same medicine, new look" check** (Now list) and the **change explained** card (#9) |
| Ayushman, ABHA and medicine papers are stuck in a tin trunk during a night emergency | **Emergency card** (#5) |
| Festival fasts: 49% of North Indian diabetics in one study fasted, and only 1.35% asked their doctor first | **Fast-day plan** that runs only the doctor's own instructions (Next) |
| About 6 in 10 elders have no smartphone, and WhatsApp no longer works on JioPhone | **Phone-call / missed-call confirmation** (Next) |
| Elders are taught never to share a 6-digit code (OTP scams), so the pairing code looks like fraud | **QR pairing in person and a spoken "no money, no OTP" promise** (Next) |
| Power cuts, dead batteries and expired prepaid packs make doses look missed | Show **"phone off" separately from "missed"** (Now), full **Phone Pulse** (Next) |

---

## 2. Top 10 features to build next

The order mostly follows the reviewers' scores. Small, foundational items were moved slightly up.

### 1. The family's own voice
**What it does:** Priya or Suresh records a 10–15 second message for each medicine, in Amma's language. The alarm and the existing Read aloud button play it instead of the English computer voice.
- **Before:** The alarm says "Glimepiride 1 milligram" in English. Kamala-amma in Madurai doesn't follow it and phones Suresh during his shift.
- **After:** She hears Suresh in Tamil: "Amma, this is the small white sugar tablet, before breakfast, one whole one."
- **What Kamala sees:** Nothing new. Same button, her son's voice.
- **Effort:** Small. **Cost:** None (the browser already has a recorder).
- **Biggest risk:** A recording goes stale after a dose change and gives wrong instructions. **Fix:** Mark recordings "out of date" automatically when a medicine changes, and fall back to the computer voice until a new one is recorded. Store the audio on the phone so it plays offline.

### 2. "She took it": the family can record a dose
**What it does:** Priya, a sibling or the helper can mark a dose as taken and say how they know: "told me on the phone", "helper gave it" or "saw on video".
- **Before:** Amma says "I took it, I forgot to press." The history shows "Missed" forever, and Priya feels she is reporting on her mother unfairly.
- **After:** Priya taps "Taken, she told me". The card turns green and shows a badge saying how it was confirmed.
- **What Kamala sees:** Her card turns green with "Taken (Priya confirmed)", and the alarm stops.
- **Effort:** Small. The database already allows it, only the route is missing. **Cost:** None.
- **Biggest risk:** Hearsay hides real missed doses, especially with memory loss. **Fix:** Always show "marked by Amma herself: 22 of 28" separately. Only the Main caregiver and Helper roles can do this. Keep an undo and a record of who did what.

### 3. Refill radar
**What it does:** Counts down tablets day by day using the schedule (not taps), warns 7 days before anything runs out, lets one sibling claim "I'll buy it", and opens the family's own WhatsApp with a ready message to their usual chemist.
- **Before:** Telma runs out on a Sunday night. Suresh and Priya both buy strips online, and Papa quietly takes it every other day until salary comes.
- **After:** "Telma: about 6 days left." Suresh taps "I'll get it", and Priya sees "Already ordered by Suresh".
- **What Kamala sees:** Nothing.
- **Effort:** Medium. Start with the count, the warning and the WhatsApp message. **Cost:** None. It uses a free wa.me link from the caregiver's own WhatsApp.
- **Biggest risk:** The count drifts and gives false comfort. **Fix:** Always say "about", ask for a quick recount now and then, and add a safety net at 3 days left. Never suggest stretching doses, and never call this "ordering".

### 4. Picture instructions on every card
**What it does:** The caregiver picks icons copied from the prescription: how many tablets (½ drawn as a half pill), before or after food, which eye, do not crush.
- **Before:** Sunita can't read "½ tab after bkfst" and gives a whole Glimepiride.
- **After:** The card shows half a pill and a plate. No reading needed.
- **What Kamala sees:** The same icons in space her card already has. No new buttons.
- **Effort:** Medium (mostly icon design). **Cost:** None.
- **Biggest risk:** A wrong icon is a silent error, and some icons are misread. **Fix:** Show the caregiver a preview to confirm before saving. Test the icons with low-literacy elders and helpers. Keep the text as a fallback.

### 5. Emergency card
**What it does:** One card per elder with photo, blood group, allergies, current medicines with photos, what was taken today, doctors' numbers, ABHA and Ayushman Vay Vandana numbers, and 108/112. It can be printed for the fridge or sent as a link that expires in 24 hours.
- **Before:** At the district hospital at 11 pm, nobody can say what Papa takes. The cards are in a trunk.
- **After:** The neighbour shows the printed sheet, or Priya sends the link from abroad.
- **What Kamala sees:** Nothing (perhaps a printed copy in her handbag).
- **Effort:** Small. **Cost:** None.
- **Biggest risk:** Sensitive ID and health data leaks through a forwarded link or a fridge door. **Fix:** Links that are random, short-lived and can be cancelled, with a log of who opened them. A print version without ABHA or insurance numbers. Label today's doses "marked in app, not verified". Do not claim any ABDM (government health records) connection.

### 6. One calm alert, with "I'm on it" and an all-clear
**What it does:** Combines all of a dose time into one alert ("8 AM medicines not marked yet"), shows whether Amma's phone was online, lets the first sibling claim it, and sends everyone an all-clear when it's sorted.
- **Before:** 4 breakfast tablets × 3 channels × 2 siblings = a flood of messages. Both siblings phone Amma within two minutes.
- **After:** One message. Priya taps "I'm on it", Suresh's alert greys out, and both get "All clear: taken at 8:52".
- **What Kamala sees:** One phone call instead of three.
- **Effort:** Medium. Do it in two parts: first combine alerts and fix the wording, then add claiming. **Cost:** None in the app. WhatsApp buttons need the paid WhatsApp Business service later (about ₹0.12–0.15 per message).
- **Biggest risk:** Messages sent through WhatsApp or SMS expose medicine names. **Fix:** Say "her 8 AM medicines", and keep the details behind sign-in.

### 7. Amma's own language, with her own names for her tablets
**What it does:** Her screen and voice in Hindi, Tamil, Malayalam or Bengali. The family types "sugar wali goli" in English letters and it is shown in her script. The lock screen says only "Paati, tablet time".
- **Before:** "Amlodipine 5 milligrams". Amma can't tell the BP tablet from the sugar tablet.
- **After:** "Pressure gulika" in Malayalam, in large letters and spoken aloud.
- **What Kamala sees:** The same screen and buttons, in her language.
- **Effort:** Medium to large (needs a speech engine and a native speaker to check every language). **Cost:** A paid speech service, or one we run ourselves on our own server, plus native-speaker checks. Start with one language.
- **Biggest risk:** Mispronounced drug names, or times stitched together wrongly ("8:15" heard as "5:18"). **Fix:** The caregiver must play the whole card before Save works. Test every stitched number. Warn when two nicknames sound alike.

### 8. "What did the doctor change?"
**What it does:** After a doctor visit or hospital discharge, someone photographs the slip and marks each medicine Continue / Changed / Stopped / New / Not sure. A main caregiver approves, and the app keeps a dated change log.
- **Before:** A blurry slip arrives on WhatsApp at 1 am New Jersey time. Priya guesses, and a stopped Glimepiride keeps ringing for 5 days.
- **After:** One before-and-after card, "Seen by Vikram 11:02 pm", and the old strip is put away.
- **What Kamala sees:** Only confirmed changes. Stopped medicines simply disappear.
- **Effort:** Medium to large. Ship a cut-down version first: photo, one tap per medicine, owner approves, change log. **Cost:** None.
- **Biggest risk:** The approval waits while the old dose keeps ringing. **Fix:** A main caregiver can approve their own edit in one tap. Offer "Pause until confirmed" for stopped medicines. Raise a loud reminder if nothing is approved within a few hours.

### 9. The change explained to Amma
**What it does:** When a medicine changes, one full-screen card shows the old pill crossed out and the new pill ticked, plays the family's recorded explanation, and has one big "OK, I understand" button.
- **Before:** Priya explains the new BP tablet three times on the phone, and Amma still takes the old pink one out of habit.
- **After:** Priya sees "Amma heard the change at 8:02 am".
- **What Kamala sees:** One card, shown once, with one button, in place of her normal card. Then a small "NEW" ribbon for a few days.
- **Effort:** Medium. Build the elder card first and the helper part later. **Cost:** None.
- **Biggest risk:** It nags her, or turns into a test of her memory. **Fix:** Show it at most three times. Never block her normal dose card. Show "not heard" neutrally on the family side.

### 10. The helper's own phone
**What it does:** A paid helper pairs her phone once with a code. She sees only today's medicines, with pictures and voice. She taps "Maine di" (I gave it) or "Nahi li" (she didn't take it), and the family can remove her in one tap.
- **Before:** Sunita gives the 8:30 tablets, nobody taps, and at 9:00 Priya calls home in a panic.
- **After:** Priya's view shows "Given by Sunita 8:35".
- **What Kamala sees:** Her card turns green with "Sunita gave this", and she keeps credit for doses she takes herself.
- **Effort:** Large (1–2 weeks). **Cost:** None on the web version. Reliable alarms need the planned Android/iPhone app (built with Capacitor).
- **Biggest risk:** Health data reaches someone outside the family, and some helpers have only keypad phones. **Fix:** Amma gives spoken consent at pairing. Today-only view. Codes that work once. Removal that takes effect immediately. A fallback so the helper can mark doses on Amma's phone.

---

## 3. Roadmap

### Now (a few days each, no paid services)
- **Family's own voice** (#1)
- **"She took it" button** (#2)
- **Refill radar, part 1**: count, 7-day warning, WhatsApp message to the chemist (#3)
- **Picture instructions** (#4)
- **Emergency card** with print version and expiring link (#5)
- **Calm alert, part 1**: one alert per dose time, "not marked yet" wording, last-seen line, all-clear (#6)
- **Doctor-change review**, cut-down version (#8)
- **Change explained card**, elder side only (#9)
- **No double dose**: "Already taken at 8:15, do not take again" on every phone
- **Same-salt warning**: "Telma 40 and Telsartan 40 both contain telmisartan." A plain text match, not interaction checking
- **"Same medicine, new look" check**: compare old and new strip photos and update the card photo
- **Course end dates**: a 14-day course stops by itself, and the elder card shows "Day 3 of 5"
- **Prescription decoder**: turns "1-0-1 AC × 2/52" into times, with a read-back the caregiver must confirm (a pharmacist checks the abbreviation table)
- **Printable kitchen chart** that warns when it is out of date
- **"What have I taken today?"**: the existing line becomes one spoken button
- **"Phone off", not "Missed"**: show last-seen and battery level now (the rest of Phone Pulse comes later)
- **Download Amma's record** (PDF and spreadsheet) and **delete account**, as the DPDP law requires
- **Phone list with remove**, plus an alert whenever a new phone is paired
- **Hand over main caregiver** (role transfer)
- **Health cards wallet** and a one-time nudge to enrol in Ayushman Vay Vandana
- **Clinic shots and long-gap doses**: B12 injections, flu shots
- **Before-procedure holds**: copy the surgeon's stop/restart dates from the slip
- **Practice mode** for the first week, so nothing is recorded and nobody is alerted
- **Pouch marks (nishaan)** on cards: "the two-band pouch" (try with a few families first)
- **When a parent passes away**: stop his alarms everywhere, quietly

### Next (needs a paid service or bigger work)
- **Amma's language** (#7), starting with one language
- **Helper's phone** (#10), then helper leave cover and handover notes
- **Phone-call and missed-call confirmation** for keypad phones (voice service, about ₹0.2 a call, TRAI registration). Later: speak "haan" instead of pressing keys
- **Scam-safe pairing**: QR scanned in person, one known caller number, spoken promise
- **Calm alert, part 2**: claiming, WhatsApp buttons, an alert order across siblings and time zones
- **"Whoever is with Amma goes first"**, with two-way SMS to keypad-phone family
- **Full Phone Pulse and the "fix-it link" for a neighbour** (needs the Capacitor app)
- **Room-by-room hearing check**, louder and lower alarm, torch flash
- **Fast-day plan and sick-day plan**, running only the doctor's written instructions
- **Memory Mode** (no Undo, "too late" cutoff from the label), only with Amma's recorded consent
- **Daily brief and Sunday letter** in each sibling's time zone
- **Doctor visit pack and test reminders**
- **Weekly pattern note** for family and doctor
- **Away mode** (weddings, stays with relatives) and **long stay abroad**
- **Jan Aushadhi price check**, caregiver-only, always "ask the doctor"
- **Prayer and temple quiet windows**
- **Cataract eye-drop chart** that tapers over weeks
- **Family members without the app**: WhatsApp voice updates at their break times
- **Shared dabba board** for joint families
- **"No sign of Amma" neighbour check**, only after real messaging is working

### Later (hardware, partnerships, regulation)
- **Chemist link** for the family's own chemist, and the **government supply planner** (PHC, ASHA, Makkalai Thedi Maruthuvam)
- **ASHA visit list**, only through an NHM or NGO partner
- **ABHA/ABDM connection**, which needs official approval
- **Care-home staff role** and senior-living partnerships
- **Comfort care mode** (palliative), after clinical and legal review
- **Batch check against CDSCO substandard-drug lists**
- **Medicine buddies** among elders, piloted with a senior club

---

## 4. What makes GoldenDose different

1. **Built for the family, not one patient.** Medisafe's "Medfriend" can only watch. It cannot mark a dose, and it sends a fixed alert after about an hour. GoldenDose lets several siblings, the helper and the person in the house share the work, with one person claiming each problem.
2. **The family's voice in any Indian language, with no translation engine.** Medisafe, MyTherapy and Hero use text or English voices. Indian pharmacy apps (Tata 1mg, PharmEasy) have basic English reminders.
3. **Designed for people who cannot read.** Pill photos, drawn amounts and food pictures. For elders with no smartphone, the plan is phone-call and missed-call confirmation, the same idea India's TB programme (99DOTS) already uses at national scale.
4. **Indian money and supply realities.** The family's own chemist on WhatsApp, cut strips, Jan Aushadhi brand switches, month-end cash shortages. Pharmacy apps push their own delivery and ignore the local chemist, where 86% of Indians buy their medicines.
5. **Honest records.** "Not marked yet" instead of "Missed", "phone off" kept separate, and every dose labelled with who confirmed it and how. That is something doctors and siblings can trust.
6. **Respect for Amma.** One screen, no new buttons, a lock screen that doesn't name her illness, and her own consent spoken aloud at setup.

---

## 5. Ideas we should NOT build (and why)

- **Camera pill identification ("Which tablet is this?")**: unreliable on look-alike small white tablets, a wrong match is dangerous, and it may count as a regulated medical device under CDSCO rules.
- **Photo of the tablet in Amma's palm at every dose**: feels like surveillance, pushes good helpers to quit, and does not prove she swallowed it.
- **A forced "outside viewer" that the family cannot remove**: overrides Amma's own consent under the DPDP law and invites family conflict.
- **"I don't feel well" emergency button that plays doctor instructions**: emergency-response liability, and it could delay a 108 call for chest pain. Point people to 108/112 instead.
- **Weekly call asking Amma whether anyone gave her other medicines**: asks her to report on herself, and elders who fear a scolding will say "no" anyway.
- **Anything where the app decides a dose, a pause or a substitute by itself**: medical advice, which only a registered doctor may give, and it crosses the CDSCO medical-device line.
- **Water-drinking reminders by default**: harmful for heart and kidney patients whose fluids are limited, unless their doctor has agreed.
- **Sharing medicine details into family WhatsApp groups**: forwards spread health data that the app can no longer control.
- **Separate niche modules** (skin patches, Paryushan-only planner, visitor banner, Parkinson's diary, PvPI reporting shortcut, helper work letter): too few users. Fold the useful parts into broader features.
- **Weekly tablet-count chore and family job board in v1**: adds work and messages for already busy caregivers, and the results are noisy.

---

## 6. Uncovered moments

These still need a good answer, even after the roadmap above:

- **Amma can't swallow any more.** Which tablets can be crushed or swapped for syrup? Only a simple "ask the pharmacist" sheet is planned.
- **The "opened on" clock.** Opened eye drops and insulin go off about 28 days after opening, long before the printed expiry date.
- **First-day setup with a basket of 10–15 strips** and old leftovers mixed in. Photo-reading of prescriptions is only about 82% accurate at best, so it can only produce drafts for a person to check.
- **Priya herself falls ill or burns out.** We need an automatic backup person if she goes silent for 48 hours.
- **Choosing which phone to buy** for Amma so its alarms actually ring.
- **A permanent move** to a son's city, the native village or a senior home.
- **Monsoon, heat waves and bandhs (strikes) that shut the chemist.** Only a simple "you have X days of tablets" warning is planned.
- **Amma stops a medicine because of a WhatsApp forward.** We need a respectful way to turn her doubt into a question for her doctor.

---

## 7. Sources

- [LASI Wave 1 Factsheet (India)](https://www.iipsindia.ac.in/sites/default/files/other_files/LASI_W1_Factsheet_INDIA.pdf)
- [LASI Wave 1 Elderly Factsheet](https://www.iipsindia.ac.in/sites/default/files/other_files/LASI_W1_Elderly_India.pdf)
- [LASI key findings, EPW 2022](https://www.iipsindia.ac.in/sites/default/files/other_files/LASI_KeyFindings_EPW2022.pdf)
- [HelpAge India Report 2026 (rural)](https://www.helpageindia.org/wp-content/uploads/2026/06/Salient-Findings-HelpAge-India-Report-2026.pdf)
- [HelpAge India 2024 press release](https://www.helpageindia.org/news/weaad-2024-press-release)
- [HelpAge India 2019 caregiving report](https://www.shethepeople.tv/news/elderly-care-helpage-india-report)
- [99DOTS accuracy study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7713673/)
- [Six-city study of older Indians' medicines](https://pmc.ncbi.nlm.nih.gov/articles/PMC11791031/)
- [West Bengal: reasons elders miss BP medicines](https://doaj.org/article/36809bc322974bda88bdd7e80765a08a)
- [Udupi: non-adherence among rural elders](https://pmc.ncbi.nlm.nih.gov/articles/PMC10351531/)
- [Polypharmacy meta-analysis, India](https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2021.685518/full)
- [Carer medicine errors at home (review)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5132322/)
- [Caregiver error types (Spain)](https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2024.1494771/full)
- [Medicine changes at hospital discharge](https://pmc.ncbi.nlm.nih.gov/articles/PMC3740385)
- [Religious fasting among North Indian diabetics](https://www.touchendocrinology.com/wp-content/uploads/sites/5/2020/02/touchENDO_US_16.1_p36-40.pdf)
- [NCDC heat-related illness manual](https://ncdc.mohfw.gov.in/uploads/pdf/heat14.pdf)
- [Don't Kill My App (phone brands)](https://dontkillmyapp.com/)
- [Android 14 exact alarm changes](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)
- [WhatsApp ends KaiOS / JioPhone support](https://www.mymobileindia.com/whatsapp-to-end-support-for-kaios-devices-by-february-2025-impacting-feature-phone-users/)
- [IAMAI–Kantar Internet in India 2024](https://www.iamai.in/sites/default/files/research/Kantar_%20IAMAI%20report_2024_.pdf)
- [Scams against senior citizens, Hyderabad](https://www.deccanchronicle.com/southern-states/telangana/cyber-crooks-siphon-102-crore-from-senior-citizens-1977979)
- [WhatsApp health misinformation in India (JMIR)](https://publichealth.jmir.org/2021/1/e19858)
- [Medisafe Medfriend help page](https://help-center.medisafe.com/en/articles/8395236-all-about-medfriends)
- [Medisafe becomes fully paid outside the US](https://help-center.medisafe.com/en/articles/13052285-medisafe-is-now-a-fully-paid-app-for-users-outside-the-u-s)
- [CDSCO medical device software guidance](https://www.emergobyul.com/news/india-cdsco-finalizes-guidance-medical-device-software)
- [DPDP Rules 2025 client alert](https://www.cyrilshroff.com/wp-content/uploads/2025/11/Client-Alert-DPDP-Rules-Nov-2025.pdf)
- [Jan Aushadhi Kendra expansion](https://organiser.org/2026/07/27/371959/bharat/from-300-to-20149-jan-aushadhi-kendras-how-pmbjp-is-transforming-affordable-healthcare-across-india/)
- [Makkalai Thedi Maruthuvam (Tamil Nadu)](https://spc.tn.gov.in/makkalai-thedi-maruthuvam/)
- [Automated voice-call reminders (Cochrane)](https://www.cochrane.org/CD009921)
- [Batched notifications and stress (Fitz et al.)](https://scholars.duke.edu/publication/1402953)