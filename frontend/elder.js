/*
  GoldenDose — Kamala's app (elder.js)
  The prototype's logic, now using the real backend:
    - The medicine list comes from   GET /api/today
    - "Taken" and "Skip" are sent as POST /api/doses
    - "Undo" is sent as              DELETE /api/doses/{id}
    - The emergency button sends     POST /api/emergency (the family is told at once)
  Words are shown in the language the family chose (elder-i18n.js).
  The alarm runs on this device from the last list it received, so it still rings
  when the internet is down. Taps made offline are kept and sent later.
*/
import { createApi } from "./shared/api.js";
import { esc, toMinutes, friendlyTime, pillPicture } from "./shared/ui.js";
import { t, setLanguage, language, SPEECH_LANG } from "./elder-i18n.js";

// ================================================================
// 1. Rules (the backend enforces the same ones)
// ================================================================
const UNDO_MINUTES = 5;
const EARLY_MINUTES = 60;
const MISSED_AFTER_MINUTES = 30;
const REPEAT_EVERY_MINUTES = 5;
const RING_FOR_SECONDS = 60;
const IGNORE_TAPS_WITHIN_MS = 800;
const REFRESH_EVERY_SECONDS = 60;
const OFFLINE_TAP_HOURS = 24;

// ================================================================
// 2. Saving things on this device (localStorage)
// Survives closing the app. Wrapped in try/catch because some browsers block it.
// ================================================================
const KEYS = { token: "goldendose.deviceToken", cache: "goldendose.todayCache", outbox: "goldendose.outbox" };
const saved = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not available */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* not available */ } },
};

const api = createApi(() => saved.get(KEYS.token));

// ================================================================
// 3. State: what the app remembers while it's open
// ================================================================
const state = {
  today: null,                          // the last reply from GET /api/today
  offline: false,
  outbox: saved.get(KEYS.outbox) ?? [], // taps waiting to be sent: { scheduleId, status, at, date }
  alarmScheduleId: null,
  lastRang: {},                         // scheduleId -> when the alarm last started for it
  ringing: false,
  version: 0,                           // goes up when something changes, so we redraw
};

const $ = (id) => document.getElementById(id);

// ================================================================
// 4. Time helpers (this device's own clock and date)
// ================================================================
function localDate(moment = new Date()) {
  const y = moment.getFullYear();
  const m = String(moment.getMonth() + 1).padStart(2, "0");
  const d = String(moment.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minutesUntil(hhmm) {
  const now = new Date();
  return toMinutes(hhmm) - (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60);
}

function clockText(moment = new Date()) {
  return friendlyTime(`${String(moment.getHours()).padStart(2, "0")}:${String(moment.getMinutes()).padStart(2, "0")}`);
}

// ================================================================
// 5. Each dose's status on screen
// The backend says: taken / skipped / missed / pending.
// The screen needs more detail for "pending": due now, due soon, or later today.
// ================================================================
function queuedFor(scheduleId) {
  return state.outbox.find((item) => item.scheduleId === scheduleId && item.date === localDate());
}

function viewStatus(dose) {
  const queued = queuedFor(dose.scheduleId);
  if (queued) return queued.status;                   // tapped while offline, not sent yet
  if (dose.status === "taken" || dose.status === "skipped") return dose.status;
  if (dose.status === "missed") return "not-taken";   // Kamala never sees the word "missed"
  // carriedOver: last night's dose, still open after midnight. Its time was yesterday, 24 hours earlier.
  const mins = minutesUntil(dose.time) - (dose.carriedOver ? 24 * 60 : 0);
  if (mins > EARLY_MINUTES) return "later";
  if (mins > 0) return "soon";
  if (mins > -MISSED_AFTER_MINUTES) return "due";
  return "not-taken";
}

// When the dose was recorded, as a real moment in time
function recordedMoment(dose) {
  const queued = queuedFor(dose.scheduleId);
  if (queued) return new Date(queued.at);
  if (!dose.recordedAt) return null;
  const [h, m] = dose.recordedAt.split(":").map(Number);
  const moment = new Date();
  moment.setHours(h, m, 0, 0);
  return moment;
}

function canUndo(dose) {
  const status = viewStatus(dose);
  if (status !== "taken" && status !== "skipped") return false;
  const moment = recordedMoment(dose);
  return Boolean(moment) && Date.now() - moment.getTime() < UNDO_MINUTES * 60_000;
}

function doses() {
  return state.today?.doses ?? [];
}

function findDose(scheduleId) {
  return doses().find((d) => d.scheduleId === scheduleId);
}

// ================================================================
// 6. Talking to the backend
// ================================================================
async function load() {
  try {
    const data = await api("GET", "/api/today");
    state.today = data;
    state.offline = false;
    saved.set(KEYS.cache, data);
    setLanguage(data.elder.language);
  } catch (error) {
    if (error.status === 401) {
      // This phone was disconnected (for example, the family removed it).
      saved.remove(KEYS.token);
      saved.remove(KEYS.cache);
      showPairing(t("disconnected")); // in Kamala's language, still known from before
      return;
    }
    state.offline = true;
    if (!state.today) state.today = cachedToday();
    if (state.today) setLanguage(state.today.elder.language);
  }
  state.version++;
}

// The last list we received, for when there's no internet.
// If it's from an earlier day, keep the medicines but clear yesterday's ticks.
function cachedToday() {
  const cached = saved.get(KEYS.cache);
  if (!cached) return null;
  if (cached.date === localDate()) return cached;
  return {
    ...cached,
    date: localDate(),
    doses: cached.doses.map((d) => ({ ...d, status: "pending", recordedAt: null, doseId: null })),
  };
}

function saveOutbox() {
  saved.set(KEYS.outbox, state.outbox);
}

// Sends taps that were made while offline. Runs every minute and when the internet returns.
// Each tap goes with the time it was really made (tappedAt), so the record shows when Kamala took it.
// A tap is kept until the backend answers, even past midnight; after 24 hours it's too old to matter.
async function sendOutbox() {
  if (state.outbox.length === 0) return;
  for (const item of [...state.outbox]) {
    if (Date.now() - item.at < OFFLINE_TAP_HOURS * 3_600_000) {
      try {
        await api("POST", "/api/doses", { scheduleId: item.scheduleId, status: item.status, tappedAt: new Date(item.at).toISOString() });
      } catch (error) {
        if (error.status === 0) return; // still offline: try again later
        // Any other answer (already recorded, too early...) means sending again won't help.
      }
    }
    state.outbox = state.outbox.filter((o) => o !== item);
    saveOutbox();
  }
  await load();
}

async function record(scheduleId, status) {
  const dose = findDose(scheduleId);
  if (!dose) return;
  if (state.alarmScheduleId === scheduleId) closeAlarm();
  if (status === "taken") showDone(new Date()); // show "Well done" straight away, don't wait for the network

  try {
    await api("POST", "/api/doses", { scheduleId, status });
    announce(`${dose.medicine.name} marked as ${status}.`);
  } catch (error) {
    if (error.status === 0) {
      state.outbox.push({ scheduleId, status, at: Date.now(), date: localDate() });
      saveOutbox();
      showNotice(t("savedOffline"));
    } else if (error.status !== 409) {
      // 409 means "already recorded", which is fine. Anything else, explain it.
      hideDone();
      showNotice(error.message);
    }
  }
  await load();
}

async function undo(scheduleId) {
  const queued = queuedFor(scheduleId);
  if (queued) {
    state.outbox = state.outbox.filter((o) => o !== queued);
    saveOutbox();
  } else {
    const dose = findDose(scheduleId);
    try {
      await api("DELETE", `/api/doses/${dose.doseId}`);
      announce(`Undone. ${dose.medicine.name} is not marked yet.`);
    } catch (error) {
      showNotice(error.status === 0 ? t("undoOffline") : error.message);
    }
  }
  // Don't ring again straight away: the card shows "Due now" with a Taken button,
  // and the alarm comes back after the usual 5 minutes if it's still not taken.
  state.lastRang[scheduleId] = Date.now();
  await load();
}

// ================================================================
// 7. Drawing the Today screen
// ================================================================
const TICK_ICON = `<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="currentColor"/>
  <path d="M10 17.5 L15 22.5 L24.5 12" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SPEAKER_ICON = `<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 10 H9 L15 5 V23 L9 18 H4 Z" fill="currentColor"/>
  <path d="M19 9.5 a6 6 0 0 1 0 9 M22 6 a10.5 10.5 0 0 1 0 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

function cardHTML(dose, isNext) {
  const status = viewStatus(dose);
  const due = friendlyTime(dose.time);
  const moment = recordedMoment(dose);
  const at = moment ? clockText(moment) : "";
  const med = dose.medicine;

  const statusLine = {
    taken: `${TICK_ICON} ${esc(t("statusTaken", { time: at }))}`,
    skipped: esc(t("statusSkipped", { time: at })),
    due: esc(t("statusDue")),
    soon: esc(t("statusSoon", { time: due })),
    "not-taken": esc(t("statusNotTaken", { time: due })),
    later: esc(t("statusLater")),
  }[status];

  let buttons = "";
  if (status === "due" || status === "soon" || status === "not-taken") {
    buttons += `<button class="btn btn-go" data-action="take" data-id="${dose.scheduleId}">${esc(t("taken"))}</button>`;
  }
  if (canUndo(dose)) {
    buttons += `<button class="btn btn-plain" data-action="undo" data-id="${dose.scheduleId}">${esc(t("undo"))}</button>`;
  }
  buttons += `<button class="btn btn-read" data-action="speak" data-id="${dose.scheduleId}">${SPEAKER_ICON} ${esc(t("readAloud"))}</button>`;

  return `
    <li class="card card-${status}${isNext ? " is-next" : ""}">
      <div class="card-top">
        <div class="pill-photo">${pillPicture(med, 56)}</div>
        <div class="card-text">
          <h2 class="med-name">${esc(med.name)}</h2>
          <p class="med-detail">${esc(med.strength ? t("detailWith", { strength: med.strength, time: due }) : t("detailAt", { time: due }))}</p>
          ${med.purpose ? `<p class="med-purpose">${esc(t("forWhat", { purpose: med.purpose }))}</p>` : ""}
          ${med.instruction ? `<p>${esc(med.instruction)}</p>` : ""}
        </div>
      </div>
      <p class="status">${statusLine}</p>
      <div class="card-actions">${buttons}</div>
    </li>`;
}

function render() {
  if (!state.today) return;
  const now = new Date();
  const hour = now.getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const list = doses();

  $("today-date").textContent = now.toLocaleDateString(`${language()}-IN`, { weekday: "long", day: "numeric", month: "long" });
  $("greeting").textContent = t(partOfDay, { name: state.today.elder.name });
  $("offline").textContent = t("offline");
  $("offline").hidden = !state.offline;
  $("sound-bar").textContent = t("soundBar");
  $("emergency-button-label").textContent = t("emergency");
  const family = state.today.elder.family ?? [];
  $("connected").hidden = family.length === 0;
  $("connected").innerHTML = family.length ? `${TICK_ICON} ${esc(t("connectedTo", { names: family.join(", ") }))}` : "";

  if (list.length === 0) {
    $("progress").textContent = "";
    $("dose-list").innerHTML = `<li class="empty">${esc(t("empty"))}</li>`;
    return;
  }

  const taken = list.filter((d) => viewStatus(d) === "taken").length;
  const dots = list.map((d) => `<span class="${viewStatus(d) === "taken" ? "on" : ""}"></span>`).join("");
  $("progress").innerHTML = `<span class="progress-dots" aria-hidden="true">${dots}</span> ${esc(t("progress", { taken, total: list.length }))}`;

  const next = list.find((d) => ["due", "soon", "not-taken"].includes(viewStatus(d)));
  $("dose-list").innerHTML = list.map((d) => cardHTML(d, d === next)).join("");
}

// ================================================================
// 8. Sound, speech and keeping the screen on
// ================================================================
let audio = null;
let soundOn = false;
let ringTimers = [];
let wakeLock = null;

// keepBar: true while a finger is still down. Removing the sound bar then would move everything up,
// and the finger would lift over a different button (an Emergency tap could miss). So the bar
// goes only when the tap is complete (the click), never on the first touch.
function switchSoundOn(keepBar = false) {
  if (!audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audio = new AudioContextClass();
  }
  if (audio && audio.state === "suspended") audio.resume();
  if (!soundOn) {
    soundOn = true;
    keepScreenOn();
  }
  if (!keepBar) $("sound-bar").hidden = true;
}

// On a bedside tablet, stop the screen going to sleep so the alarm is seen.
async function keepScreenOn() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* not supported: fine */ }
}

function chime() {
  if (!audio) return;
  const start = audio.currentTime;
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
  // A voice for Kamala's language, if this phone has one ("hi-IN" for Hindi). Otherwise the phone's default.
  const wanted = SPEECH_LANG[language()];
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.replace("_", "-") === wanted)
    || voices.find((v) => v.lang.startsWith(wanted.slice(0, 2)));
  if (voice) words.voice = voice;
  words.lang = voice ? voice.lang : wanted;
  words.rate = 0.85;
  window.speechSynthesis.speak(words);
}

function speakDose(dose) {
  const med = dose.medicine;
  speak(`${med.name}${med.strength ? `, ${med.strength}` : ""}. ${med.purpose ? `${t("forWhat", { purpose: med.purpose })}. ` : ""}${med.instruction || ""}`);
}

function startRinging(dose) {
  stopRinging();
  state.ringing = true;
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
// 9. The alarm screen
// ================================================================
function openAlarm(dose) {
  const firstTime = state.alarmScheduleId !== dose.scheduleId;
  state.alarmScheduleId = dose.scheduleId;
  state.lastRang[dose.scheduleId] = Date.now();
  const med = dose.medicine;

  $("alarm-pill").innerHTML = pillPicture(med, 130);
  $("alarm-name").textContent = `${med.name} ${med.strength}`.trim();
  $("alarm-instruction").textContent = [med.purpose && t("forWhat", { purpose: med.purpose }), med.instruction].filter(Boolean).join(" · ");
  $("alarm-title").textContent = t("alarmTitle");
  $("alarm-take").textContent = t("taken");
  $("alarm-skip").textContent = t("skip");
  $("alarm-note").textContent = soundOn ? t("ringing") : t("tapToHear");
  $("alarm").hidden = false;
  document.body.classList.add("alarm-open");
  if (firstTime) $("alarm-take").focus();
  startRinging(dose);
}

function closeAlarm() {
  stopRinging();
  state.alarmScheduleId = null;
  $("alarm").hidden = true;
  document.body.classList.remove("alarm-open");
}

function showDone(at) {
  $("done-title").textContent = t("wellDone");
  $("done-time").textContent = t("doneAt", { time: clockText(at) });
  $("done").hidden = false;
  clearTimeout(showDone.timer);
  showDone.timer = setTimeout(hideDone, 2500);
}

function hideDone() {
  $("done").hidden = true;
}

function showNotice(message) {
  const notice = $("notice");
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { notice.hidden = true; }, 7000);
}

function announce(message) {
  $("announcer").textContent = message;
}

// ================================================================
// 10. Taps
// ================================================================
let lastTapAt = 0;

document.addEventListener("pointerdown", () => switchSoundOn(true));

document.addEventListener("click", async (event) => {
  switchSoundOn();
  const button = event.target.closest("[data-action]");
  if (!button) return;

  // Wrong-tap protection: ignore a second tap that comes too quickly.
  const tapTime = Date.now();
  if (tapTime - lastTapAt < IGNORE_TAPS_WITHIN_MS) return;
  lastTapAt = tapTime;

  const scheduleId = Number(button.dataset.id) || state.alarmScheduleId;
  switch (button.dataset.action) {
    case "take":
    case "take-from-alarm":
      await record(scheduleId, "taken"); break;
    case "skip-from-alarm":
      await record(scheduleId, "skipped"); break;
    case "undo":
      await undo(scheduleId); break;
    case "speak":
      speakDose(findDose(scheduleId)); break;
    case "emergency":
      await startEmergency(); break;
    case "emergency-ok":
      await emergencyOk(); break;
  }
  tick();
});

document.addEventListener("contextmenu", (event) => {
  if (event.target.closest("button")) event.preventDefault();
});

// ================================================================
// 11. The heartbeat: every second, check the alarm and redraw if needed
// ================================================================
let lastDrawn = "";
let lastDate = localDate();

function tick() {
  if (!state.today) return;
  const now = Date.now();

  // Midnight has just passed: ask the backend for the new day's list straight away. It still includes
  // a late-evening dose that hasn't been marked yet, so that alarm keeps going.
  if (localDate() !== lastDate) {
    lastDate = localDate();
    load().then(tick);
  }

  for (const dose of doses()) {
    if (viewStatus(dose) !== "due") continue;
    const last = state.lastRang[dose.scheduleId];
    const timeToRing = !last || now - last >= REPEAT_EVERY_MINUTES * 60_000;
    const alarmFree = state.alarmScheduleId === null || state.alarmScheduleId === dose.scheduleId;
    if (timeToRing && alarmFree) openAlarm(dose);
  }

  // Close the alarm if its dose is no longer due (recorded elsewhere, or 30 minutes have passed).
  if (state.alarmScheduleId !== null) {
    const alarmDose = findDose(state.alarmScheduleId);
    if (!alarmDose || viewStatus(alarmDose) !== "due") {
      closeAlarm();
    } else if (state.ringing && now - state.lastRang[state.alarmScheduleId] > RING_FOR_SECONDS * 1000) {
      stopRinging();
      const nextRing = new Date(state.lastRang[state.alarmScheduleId] + REPEAT_EVERY_MINUTES * 60_000);
      $("alarm-note").textContent = t("ringsAgain", { time: clockText(nextRing) });
    }
    $("alarm-clock").textContent = clockText();
  }

  const minute = new Date().getMinutes();
  const drawKey = `${minute}:${state.version}`;
  if (drawKey !== lastDrawn) {
    lastDrawn = drawKey;
    render();
  }
}

// ================================================================
// 11b. The emergency button
// One tap tells the family at once (with a map link if the phone shares its location),
// and shows big buttons to call the ambulance (108) or the family's hospital, or see the
// nearest hospitals on a map. A phone call needs a tap from Kamala: a web page can't dial by itself.
// ================================================================
let emergencyId = null;

// Where the phone is, if Kamala allows it. Gives up after 4 seconds so help isn't delayed.
function whereAmI() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (position) => { clearTimeout(timer); resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300_000 },
    );
  });
}

async function startEmergency() {
  closeAlarm();
  const hospital = state.today?.elder.hospital;
  $("em-title").textContent = t("emTitle");
  $("em-status").textContent = t("emTelling");
  $("em-ambulance").textContent = t("callAmbulance");
  $("em-hospital").hidden = !hospital;
  if (hospital) {
    $("em-hospital").textContent = t("callHospital", { name: hospital.name || hospital.phone });
    $("em-hospital").href = `tel:${hospital.phone.replace(/[^\d+]/g, "")}`;
  }
  $("em-nearest").textContent = t("nearest");
  $("em-nearest").href = "https://www.google.com/maps/search/hospital+near+me";
  $("em-ok").textContent = t("ok");
  $("emergency").hidden = false;
  document.body.classList.add("alarm-open");
  $("em-ambulance").focus();

  const location = await whereAmI();
  if (location) {
    $("em-nearest").href = `https://www.google.com/maps/search/hospital/@${location.latitude},${location.longitude},14z`;
  }
  try {
    const reply = await api("POST", "/api/emergency", location ?? {});
    emergencyId = reply.emergencyId;
    $("em-status").textContent = t("emTold");
  } catch {
    $("em-status").textContent = t("emFailed");
  }
}

async function emergencyOk() {
  $("emergency").hidden = true;
  document.body.classList.remove("alarm-open");
  if (emergencyId) {
    try {
      await api("POST", `/api/emergency/${emergencyId}/ok`);
      showNotice(t("okTold"));
    } catch { /* the family was already told about the emergency; they'll call */ }
    emergencyId = null;
  }
}

// ================================================================
// 12. Pairing
// ================================================================
function showPairing(message) {
  closeAlarm();
  $("today-view").hidden = true;
  $("sound-bar").hidden = true;
  $("pair-view").hidden = false;
  if (message) $("pair-text").textContent = message;
}

$("pair-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = $("pair-code").value.replace(/\D/g, "");
  if (code.length !== 6) {
    $("pair-error").textContent = "Type all 6 numbers of the code.";
    return;
  }
  $("pair-error").textContent = "";
  $("pair-button").disabled = true;
  $("pair-button").textContent = "Connecting…";
  try {
    const reply = await api("POST", "/api/devices/pair", { code, platform: "web" });
    saved.set(KEYS.token, reply.deviceToken);
    $("pair-code").value = "";
    await showToday();
  } catch (error) {
    $("pair-error").textContent = error.message;
  } finally {
    $("pair-button").disabled = false;
    $("pair-button").textContent = "Connect";
  }
});

$("pair-code").addEventListener("input", () => { $("pair-error").textContent = ""; });

// ================================================================
// 13. Start
// ================================================================
let started = false;

async function showToday() {
  $("pair-view").hidden = true;
  $("today-view").hidden = false;
  $("sound-bar").hidden = soundOn;
  await sendOutbox();
  await load();
  render();
  if (!started) {
    started = true;
    setInterval(tick, 1000);
    setInterval(async () => { await sendOutbox(); await load(); }, REFRESH_EVERY_SECONDS * 1000);
    window.addEventListener("online", async () => { await sendOutbox(); await load(); });
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      if (soundOn) keepScreenOn();
      await load();
    });
  }
  tick();
}

if (saved.get(KEYS.token)) {
  showToday();
} else {
  showPairing();
}
