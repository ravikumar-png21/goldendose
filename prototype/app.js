/*
  GoldenDose prototype — app.js
  JavaScript = the wiring. It decides what happens when something is tapped,
  keeps track of what has been taken, rings the alarm, and redraws the screen.
*/
"use strict";

// ================================================================
// 1. MADE-UP DATA
// In the real app this list comes from the backend through the API
// (GET /api/doses/today). For the prototype we type it in by hand.
// ================================================================
const ELDER_NAME = "Kamala";
const CAREGIVER_NAME = "Priya";

const doses = [
  { id: 1, name: "Metformin", dose: "500 mg", time: "08:00",
    instruction: "Take one white tablet after food",
    pill: { shape: "round", color: "#FFFFFF" } },
  { id: 2, name: "Amlodipine", dose: "5 mg", time: "09:00",
    instruction: "Take one pink tablet",
    pill: { shape: "oval", color: "#F4A7B9" } },
  { id: 3, name: "Vitamin D3", dose: "1000 IU", time: "13:00",
    instruction: "Take one yellow capsule with lunch",
    pill: { shape: "capsule", color: "#F2C14E", color2: "#FFFFFF" } },
  { id: 4, name: "Metformin", dose: "500 mg", time: "20:00",
    instruction: "Take one white tablet after food",
    pill: { shape: "round", color: "#FFFFFF" } },
  { id: 5, name: "Atorvastatin", dose: "10 mg", time: "21:30",
    instruction: "Take one blue tablet at bedtime",
    pill: { shape: "oval", color: "#8FB8F0" } },
];

// ================================================================
// 2. RULES FROM THE REQUIREMENTS (docs/REQUIREMENTS.md and docs/UX-FLOWS.md)
// Keeping them as named numbers means we can change a rule in one place.
// ================================================================
const UNDO_MINUTES = 5;          // "Taken" can be undone for 5 minutes
const EARLY_MINUTES = 60;        // a dose can be marked up to 60 minutes early
const MISSED_AFTER_MINUTES = 30; // after 30 minutes the caregiver is told
const REPEAT_EVERY_MINUTES = 5;  // the alarm rings again every 5 minutes
const RING_FOR_SECONDS = 60;     // each round of ringing lasts 1 minute
const IGNORE_TAPS_WITHIN_MS = 800; // a second tap this soon is treated as accidental

// ================================================================
// 3. STATE: what the app remembers while it is open
// In the real app, "records" is saved in the database by the backend.
// ================================================================
const state = {
  records: {},       // doseId -> { status: "taken" | "skipped", at: Date }
  lastRang: {},      // doseId -> when the alarm last started ringing for it
  alerted: {},       // doseId -> true once the caregiver has been told
  alarmDoseId: null, // which dose the alarm screen is showing, if any
  ringing: false,
  version: 0,        // goes up whenever something changes, so we know to redraw
};

// ================================================================
// 4. A PRETEND CLOCK
// The prototype starts at 8:58 am so the 9:00 alarm rings two minutes in.
// The prototype controls can move it forward.
// ================================================================
let clockOffset = 0;

function now() {
  return new Date(Date.now() + clockOffset);
}

function setClockTo(hours, minutes) {
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  clockOffset = target.getTime() - Date.now();
}

function doseDate(dose) {
  const [h, m] = dose.time.split(":").map(Number);
  const d = now();
  d.setHours(h, m, 0, 0);
  return d;
}

function minutesUntil(dose) {
  return (doseDate(dose) - now()) / 60000;
}

function formatTime(date) {
  // Gives "9:02 am"
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

// ================================================================
// 5. WORKING OUT EACH DOSE'S STATUS (the "business logic")
// In the real app the backend does this, so every phone agrees.
// ================================================================
function statusOf(dose) {
  const record = state.records[dose.id];
  if (record) return record.status;              // "taken" or "skipped"
  const mins = minutesUntil(dose);
  if (mins > EARLY_MINUTES) return "later";      // too early to take
  if (mins > 0) return "soon";                   // within the hour before
  if (mins > -MISSED_AFTER_MINUTES) return "due";// due now, alarm ringing
  return "not-taken";                            // late, caregiver told
}

function canUndo(dose) {
  const record = state.records[dose.id];
  return Boolean(record) && now() - record.at < UNDO_MINUTES * 60000;
}

// ================================================================
// 6. PILL PICTURES
// The real app will show a photo the caregiver takes. Until then we draw
// the pill's shape and colour, since that's how people recognise it.
// ================================================================
function pillSVG(pill) {
  const outline = "#3A3A36";
  if (pill.shape === "round") {
    return `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="${pill.color}" stroke="${outline}" stroke-width="2.5"/>
      <line x1="16" y1="32" x2="48" y2="32" stroke="${outline}" stroke-width="2" opacity="0.45"/>
    </svg>`;
  }
  if (pill.shape === "oval") {
    return `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      <ellipse cx="32" cy="32" rx="26" ry="15" transform="rotate(-25 32 32)"
        fill="${pill.color}" stroke="${outline}" stroke-width="2.5"/>
    </svg>`;
  }
  // capsule
  return `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
    <g transform="rotate(-35 32 32)">
      <path d="M32 21 H19 a11 11 0 0 0 0 22 H32 Z" fill="${pill.color}" stroke="${outline}" stroke-width="2.5"/>
      <path d="M32 21 H45 a11 11 0 0 1 0 22 H32 Z" fill="${pill.color2 || "#FFFFFF"}" stroke="${outline}" stroke-width="2.5"/>
    </g>
  </svg>`;
}

const TICK_ICON = `<svg viewBox="0 0 34 34" aria-hidden="true">
  <circle cx="17" cy="17" r="15" fill="currentColor"/>
  <path d="M10 17.5 L15 22.5 L24.5 12" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const SPEAKER_ICON = `<svg viewBox="0 0 28 28" aria-hidden="true">
  <path d="M4 10 H9 L15 5 V23 L9 18 H4 Z" fill="currentColor"/>
  <path d="M19 9.5 a6 6 0 0 1 0 9 M22 6 a10.5 10.5 0 0 1 0 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

// ================================================================
// 7. DRAWING THE TODAY SCREEN
// We build each card as a piece of HTML text, then put it on the page.
// ================================================================
function cardHTML(dose, isNext) {
  const status = statusOf(dose);
  const record = state.records[dose.id];
  const due = formatTime(doseDate(dose));

  const statusLines = {
    taken: `<p class="status">${TICK_ICON} Taken at ${record ? formatTime(record.at) : ""}</p>`,
    skipped: `<p class="status">Skipped at ${record ? formatTime(record.at) : ""}</p>`,
    due: `<p class="status">Due now</p>`,
    soon: `<p class="status">Due at ${due}</p>`,
    "not-taken": `<p class="status">Not taken yet. It was due at ${due}</p>`,
    later: `<p class="status">Later today</p>`,
  };

  let buttons = "";
  if (status === "due" || status === "soon" || status === "not-taken") {
    buttons += `<button class="btn btn-go" data-action="take" data-id="${dose.id}">Taken</button>`;
  }
  if (canUndo(dose)) {
    buttons += `<button class="btn btn-plain" data-action="undo" data-id="${dose.id}">Undo</button>`;
  }
  buttons += `<button class="btn btn-read" data-action="speak" data-id="${dose.id}">${SPEAKER_ICON} Read aloud</button>`;

  return `
    <li class="card card-${status}${isNext ? " is-next" : ""}">
      <div class="card-top">
        <div class="pill-photo">${pillSVG(dose.pill)}</div>
        <div class="card-text">
          <h2 class="med-name">${dose.name}</h2>
          <p class="med-detail">${dose.dose} at <span class="nowrap">${due}</span></p>
          <p>${dose.instruction}</p>
        </div>
      </div>
      ${statusLines[status]}
      <div class="card-actions">${buttons}</div>
    </li>`;
}

function render() {
  const t = now();
  const hour = t.getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  document.getElementById("today-date").textContent =
    t.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("greeting").textContent = `Good ${partOfDay}, ${ELDER_NAME}`;

  const takenCount = doses.filter((d) => statusOf(d) === "taken").length;
  const dots = doses.map((d) => `<span class="${statusOf(d) === "taken" ? "on" : ""}"></span>`).join("");
  document.getElementById("progress").innerHTML =
    `<span class="progress-dots" aria-hidden="true">${dots}</span>
     ${takenCount} of ${doses.length} medicines taken today`;

  // The "next" dose is the first one still waiting to be taken. It gets a thick border.
  const next = doses.find((d) => ["due", "soon", "not-taken"].includes(statusOf(d)));

  document.getElementById("dose-list").innerHTML =
    doses.map((d) => cardHTML(d, d === next)).join("");
}

// ================================================================
// 8. SOUND AND SPEECH
// Browsers only allow sound after the person has tapped something once,
// so we switch sound on at the first tap.
// ================================================================
let audio = null;
let ringTimers = [];

function unlockSound() {
  if (!audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audio = new AudioContextClass();
  }
  if (audio && audio.state === "suspended") audio.resume();
}

function chime() {
  if (!audio) return;
  const start = audio.currentTime;
  // Three notes: high, low, high. Like a doorbell.
  [[880, 0], [660, 0.35], [880, 0.7]].forEach(([frequency, delay]) => {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start + delay);
    volume.gain.exponentialRampToValueAtTime(0.5, start + delay + 0.03);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.3);
    tone.connect(volume).connect(audio.destination);
    tone.start(start + delay);
    tone.stop(start + delay + 0.32);
  });
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const words = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === "en-IN") || voices.find((v) => v.lang.startsWith("en"));
  if (voice) words.voice = voice;
  words.lang = voice ? voice.lang : "en-IN";
  words.rate = 0.85; // a little slower than normal
  window.speechSynthesis.speak(words);
}

function speakDose(dose) {
  speak(`${dose.name}, ${dose.dose}. ${dose.instruction}.`);
}

function startRinging(dose) {
  stopRinging();
  state.ringing = true;
  // One round = chime, chime, then speak the instruction. Repeat every 9 seconds.
  const oneRound = () => {
    chime();
    ringTimers.push(setTimeout(chime, 2000));
    ringTimers.push(setTimeout(() => speakDose(dose), 4000));
  };
  oneRound();
  ringTimers.push(setInterval(oneRound, 9000));
}

function stopRinging() {
  ringTimers.forEach((timer) => { clearTimeout(timer); clearInterval(timer); });
  ringTimers = [];
  state.ringing = false;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// ================================================================
// 9. THE ALARM SCREEN
// ================================================================
function openAlarm(dose) {
  const firstTime = state.alarmDoseId !== dose.id;
  state.alarmDoseId = dose.id;
  state.lastRang[dose.id] = now();

  document.getElementById("alarm-pill").innerHTML = pillSVG(dose.pill);
  document.getElementById("alarm-name").textContent = `${dose.name} ${dose.dose}`;
  document.getElementById("alarm-instruction").textContent = dose.instruction;
  document.getElementById("alarm-note").textContent = "Ringing";
  document.getElementById("alarm").hidden = false;
  document.body.classList.add("alarm-open");
  if (firstTime) document.getElementById("alarm-take").focus();

  startRinging(dose);
  log(`${formatTime(now())} Alarm rings for ${dose.name}. (Real phone app: a lock-screen alarm, even if the phone is asleep.)`);
}

function closeAlarm() {
  stopRinging();
  state.alarmDoseId = null;
  document.getElementById("alarm").hidden = true;
  document.body.classList.remove("alarm-open");
}

// ================================================================
// 10. ACTIONS: what happens when each button is tapped
// ================================================================
function markTaken(dose) {
  state.records[dose.id] = { status: "taken", at: now() };
  if (state.alarmDoseId === dose.id) closeAlarm();
  state.version++;
  showDone(state.records[dose.id].at);
  announce(`${dose.name} marked as taken.`);
  log(`POST /api/doses  { scheduleId: ${dose.id}, status: "taken" }  → 201 Created. Backend saves one row in the dose_log table`);
}

function markSkipped(dose) {
  state.records[dose.id] = { status: "skipped", at: now() };
  closeAlarm();
  state.version++;
  announce(`${dose.name} skipped.`);
  log(`POST /api/doses  { scheduleId: ${dose.id}, status: "skipped" }  → 201 Created. ${CAREGIVER_NAME} can see it in History`);
}

function undo(dose) {
  delete state.records[dose.id];
  delete state.lastRang[dose.id];
  state.version++;
  announce(`Undone. ${dose.name} is not marked yet.`);
  log(`DELETE /api/doses/{doseId}  → 204 No Content. Backend removes the record (allowed within 5 minutes)`);
}

function showDone(at) {
  const done = document.getElementById("done");
  document.getElementById("done-time").textContent = `Taken at ${formatTime(at)}`;
  done.hidden = false;
  setTimeout(() => { done.hidden = true; }, 2500);
}

function announce(message) {
  document.getElementById("announcer").textContent = message;
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = message;
  const list = document.getElementById("demo-log");
  list.prepend(item);
}

// One listener for the whole page. It finds the button that was tapped
// by reading its data-action attribute. This is called "event delegation".
let lastTapAt = 0;

document.addEventListener("click", (event) => {
  unlockSound();
  const button = event.target.closest("[data-action]");
  if (!button) return;

  // Wrong-tap protection: ignore a second tap that comes too quickly.
  const tapTime = Date.now();
  if (tapTime - lastTapAt < IGNORE_TAPS_WITHIN_MS) return;
  lastTapAt = tapTime;

  const dose = doses.find((d) => d.id === Number(button.dataset.id));
  const alarmDose = doses.find((d) => d.id === state.alarmDoseId);

  switch (button.dataset.action) {
    case "take": markTaken(dose); break;
    case "undo": undo(dose); break;
    case "speak": speakDose(dose); break;
    case "take-from-alarm": markTaken(alarmDose); break;
    case "skip-from-alarm": markSkipped(alarmDose); break;
    case "demo-ring": ringNextNow(); break;
    case "demo-jump":
      clockOffset += 10 * 60000;
      log(`(Clock moved forward to ${formatTime(now())})`);
      break;
    case "demo-reset": window.location.reload(); break;
  }
  tick();
});

// Long press opens a menu on phones. We switch that off on buttons.
document.addEventListener("contextmenu", (event) => {
  if (event.target.closest("button")) event.preventDefault();
});

function ringNextNow() {
  const next = doses.find((d) => !state.records[d.id] && minutesUntil(d) > -MISSED_AFTER_MINUTES);
  if (!next) { log("No more doses today."); return; }
  const [h, m] = next.time.split(":").map(Number);
  setClockTo(h, m);
  delete state.lastRang[next.id];
  log(`(Clock moved to ${formatTime(now())})`);
}

// ================================================================
// 11. THE HEARTBEAT: runs every second
// Checks whether an alarm should ring, stop, or whether a dose is now missed.
// ================================================================
let lastDrawn = "";

function tick() {
  const t = now();

  for (const dose of doses) {
    if (state.records[dose.id]) continue; // already taken or skipped
    const mins = minutesUntil(dose);

    // Due: ring now, and again every 5 minutes until answered.
    if (mins <= 0 && mins > -MISSED_AFTER_MINUTES) {
      const last = state.lastRang[dose.id];
      const timeToRing = !last || t - last >= REPEAT_EVERY_MINUTES * 60000;
      const alarmFree = state.alarmDoseId === null || state.alarmDoseId === dose.id;
      if (timeToRing && alarmFree) openAlarm(dose);
    }

    // 30 minutes late: stop the alarm and tell the caregiver.
    if (mins <= -MISSED_AFTER_MINUTES && !state.alerted[dose.id]) {
      state.alerted[dose.id] = true;
      if (state.alarmDoseId === dose.id) closeAlarm();
      state.version++;
      log(`${formatTime(t)} ${dose.name} not taken after 30 minutes → backend sends ${CAREGIVER_NAME} a message: "${ELDER_NAME} hasn't taken ${dose.name} (due ${formatTime(doseDate(dose))})"`);
    }
  }

  // Each round of ringing lasts 1 minute, then goes quiet until the next round.
  if (state.alarmDoseId !== null && state.ringing) {
    if (t - state.lastRang[state.alarmDoseId] > RING_FOR_SECONDS * 1000) {
      stopRinging();
      const nextRing = new Date(state.lastRang[state.alarmDoseId].getTime() + REPEAT_EVERY_MINUTES * 60000);
      document.getElementById("alarm-note").textContent = `Rings again at ${formatTime(nextRing)}`;
    }
  }

  if (state.alarmDoseId !== null) {
    document.getElementById("alarm-clock").textContent = formatTime(t);
  }
  document.getElementById("demo-clock").textContent =
    t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }).toLowerCase();

  // Redraw the cards only when the minute changes or something happened.
  // Redrawing every second would make buttons flicker and lose keyboard focus.
  const drawKey = `${t.getHours()}:${t.getMinutes()}:${state.version}`;
  if (drawKey !== lastDrawn) {
    lastDrawn = drawKey;
    render();
  }
}

// ================================================================
// 12. START
// ================================================================
setClockTo(8, 58);
state.records[1] = { status: "taken", at: (() => { const d = now(); d.setHours(8, 7, 0, 0); return d; })() };
tick();
setInterval(tick, 1000);
