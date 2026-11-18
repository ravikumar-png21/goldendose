/*
  GoldenDose — the caregiver app (care.js)
  Screens (the part of the address after #):
    #/signin, #/signup           sign in or create an account
    #/                           the people I look after
    #/account                    my account: change password, sign out everywhere
    #/elder/1                    one person: today, medicines, pairing their phone
    #/elder/1/setup              first-time setup, step by step: medicine, their phone, alerts
    #/elder/1/add                add a medicine
    #/elder/1/medicine/3         change or stop a medicine
    #/elder/1/history            the last 7 days
    #/elder/1/settings           my alerts, and inviting family
    #/elder/1/details            their app's language, emergency hospital, and our chemist
    #/elder/1/prescriptions      photos and PDFs of the doctor's prescriptions
    #/elder/1/report             the doctor visit report (print, PDF, spreadsheet, WhatsApp)
    #/elder/1/changes            the change history, changes waiting for approval, the list on a past date
    #/elder/1/checkup            the setup check
    #/elder/1/health             health records: blood reports, tests due, blood pressure, the next doctor visit
    #/elder/1/health/report      add a blood report
  On every page about one person there's also an "Ask" button: questions in plain words.
*/
import { createApi } from "../shared/api.js";
import { esc, friendlyTime, toMinutes, localParts, pillSVG, pillPicture } from "../shared/ui.js";
import { LANGUAGE_NAMES } from "../elder-i18n.js";

// ================================================================
// 1. Signing in: the token is kept on this device
// ================================================================
const TOKEN_KEY = "goldendose.caregiverToken";
function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* not available */ }
}

const api = createApi(getToken);
const view = document.getElementById("view");
const signOutButton = document.getElementById("sign-out");

const COLOURS = [
  ["White", "#FFFFFF"], ["Cream", "#F5EBD0"], ["Yellow", "#F2C14E"], ["Orange", "#F29B4E"], ["Pink", "#F4A7B9"],
  ["Red", "#D9534F"], ["Blue", "#8FB8F0"], ["Green", "#8FD19E"], ["Brown", "#A47551"],
];
const SHAPES = [["round", "Round"], ["oval", "Oval"], ["capsule", "Capsule"]];

// ================================================================
// 2. The router: shows the right screen for the address
// ================================================================
window.addEventListener("hashchange", route);
// The first screen is shown at the very end of this file, once everything below is ready.

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const signedIn = Boolean(getToken());
  signOutButton.hidden = !signedIn;

  if (parts[0] === "signin" || parts[0] === "signup") return showSignIn(parts[0] === "signup");
  if (!signedIn) return go("#/signin");

  view.innerHTML = `<p class="loading">Loading…</p>`;
  view.onclick = null; // a page's own click handler doesn't carry over to the next page
  stopWatchingPhone();  // nor does waiting for a phone to connect
  askFor(parts[0] === "elder" && parts[1] ? Number(parts[1]) : null); // the Ask button, on pages about one person
  try {
    if (parts.length === 0) return await showHome();
    if (parts[0] === "account") return await showAccount();
    if (parts[0] === "elder" && parts[1]) {
      const elderId = Number(parts[1]);
      if (parts.length === 2) return await showElder(elderId);
      if (parts[2] === "add") return await showMedicineForm(elderId, null, parts[3] === "setup" ? `#/elder/${elderId}/setup` : null);
      if (parts[2] === "setup") return await showSetup(elderId);
      if (parts[2] === "medicine" && parts[3]) return await showMedicineForm(elderId, Number(parts[3]));
      if (parts[2] === "history") return await showHistory(elderId);
      if (parts[2] === "settings") return await showSettings(elderId);
      if (parts[2] === "details") return await showDetails(elderId);
      if (parts[2] === "prescriptions") return await showPrescriptions(elderId);
      if (parts[2] === "report") return await showReport(elderId);
      if (parts[2] === "changes") return await showChanges(elderId);
      if (parts[2] === "checkup") return await showCheckup(elderId);
      if (parts[2] === "health" && parts[3] === "report") return await showLabReportForm(elderId);
      if (parts[2] === "health") return await showHealth(elderId);
    }
    show("Not found", `<section><h1>That page doesn't exist</h1><a class="btn" href="#/">Go to the start</a></section>`);
  } catch (error) {
    showError(error);
  }
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// Puts a screen on the page and moves focus to it (helps screen-reader users).
function show(title, html) {
  document.title = `${title} · GoldenDose Family`;
  view.innerHTML = html;
  view.focus();
  window.scrollTo(0, 0);
}

function showError(error) {
  if (error.status === 401) {
    setToken(null);
    return go("#/signin");
  }
  show("Problem", `<section><h1>Something went wrong</h1><p>${esc(error.message)}</p>
    <div class="actions"><button class="btn" type="button" id="retry">Try again</button><a class="btn" href="#/">Go to the start</a></div></section>`);
  document.getElementById("retry").addEventListener("click", route);
}

// Runs a form's save action, with a busy button and an inline error message.
async function submitting(form, work, busyLabel = "Saving…") {
  const button = form.querySelector("[type=submit]");
  const errorBox = form.querySelector(".form-error");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  if (errorBox) errorBox.textContent = "";
  try {
    await work();
  } catch (error) {
    // 401 while signed in means the sign-in expired: go back to the sign-in screen.
    // 401 on the sign-in screen itself just means a wrong password: show the message.
    if (error.status === 401 && getToken()) return showError(error);
    if (errorBox) errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

signOutButton.addEventListener("click", async () => {
  try { await api("POST", "/api/auth/logout"); } catch { /* signing out locally is enough */ }
  setToken(null);
  go("#/signin");
});

// ================================================================
// 3. Small helpers
// ================================================================
function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// The address the elder's phone should open. "localhost" only works on this computer,
// so when the family app is open on localhost, show the computer's Wi-Fi address instead.
let wifiAddress;
async function phoneAddress() {
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) return location.origin;
  if (wifiAddress === undefined) {
    try { wifiAddress = (await api("GET", "/api/address")).wifi; } catch { wifiAddress = null; }
  }
  return wifiAddress ?? location.origin;
}

// The connection code with step-by-step instructions for the elder's phone.
async function connectionStepsHTML(elder, code, expiresAt) {
  const until = new Date(expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const address = await phoneAddress();
  return `
    <ol class="connect-steps">
      <li>On ${esc(elder.name)}'s phone, open the internet browser (Chrome or Safari).${address.includes("192.") || address.includes("10.") ? " The phone must be on the same Wi-Fi as this computer." : ""}</li>
      <li>In the address bar at the top, type <strong><code>${esc(address.replace(/^https?:\/\//, ""))}</code></strong> and press Go.</li>
      <li>${esc(elder.name)}'s phone shows <em>Welcome to GoldenDose</em>. In the Code box, type:
        <p class="code">${code.slice(0, 3)} ${code.slice(3)}</p></li>
      <li>Tap <strong>Connect</strong>. That's all: ${esc(elder.name)} never needs a password.</li>
    </ol>
    <p class="hint">The code works once, until ${until}. If it runs out, get a new one.</p>
    <p class="phone-waiting" role="status"><span class="spinner" aria-hidden="true"></span> Waiting for ${esc(elder.name)}'s phone to connect…</p>`;
}

// Checks every 3 seconds whether the elder's phone has connected, then calls onConnected once.
let phoneWatch = null;
function watchPhone(elderId, onConnected) {
  stopWatchingPhone();
  phoneWatch = setInterval(async () => {
    try {
      const checkup = await api("GET", `/api/elders/${elderId}/checkup`);
      if (checkup.items.find((i) => i.key === "phone")?.ok) {
        stopWatchingPhone();
        onConnected(checkup);
      }
    } catch { /* try again in a moment */ }
  }, 3000);
}
function stopWatchingPhone() {
  if (phoneWatch) clearInterval(phoneWatch);
  phoneWatch = null;
}

// "just now", "5 minutes ago", "3 hours ago", "2 days ago"
function timeAgo(isoMoment) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(isoMoment)) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// "Thu 23 Oct"
function shortDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// A stored moment as "21 Oct, 9:05 pm" where the elder lives
function elderMoment(isoMoment, timeZone) {
  const p = localParts(new Date(isoMoment), timeZone);
  return `${new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}, ${friendlyTime(p.hhmm)}`;
}

// The "Needs attention" list: most serious first, each with what to do and where.
const SEVERITY_WORDS = { urgent: "Urgent", high: "Today", medium: "Worth a look", low: "Setup" };
function attentionList(items, { showName = false } = {}) {
  return `<ul class="list attention">${items.map((a) => `
    <li><a class="card attention-${a.severity}" href="${esc(a.link)}">
      <span class="card-body">
        <span class="attention-tag">${SEVERITY_WORDS[a.severity]}${showName ? ` · ${esc(a.elderName)}` : ""}</span>
        <span class="card-title">${esc(a.title)}</span>
        <span class="card-meta">${esc(a.detail)}</span></span>
      <span class="chevron" aria-hidden="true">›</span></a></li>`).join("")}</ul>`;
}

// A stored moment shown as a clock time where the elder lives
function elderClock(isoMoment, timeZone) {
  return friendlyTime(localParts(new Date(isoMoment), timeZone).hhmm);
}

async function loadElder(elderId) {
  const elders = await api("GET", "/api/elders");
  const elder = elders.find((e) => e.id === elderId);
  if (!elder) throw Object.assign(new Error("You don't look after this person, or they don't exist."), { status: 404 });
  return elder;
}

function statusChip(record, time, nowMinutes, timeZone) {
  if (record?.status === "taken") return `<span class="chip chip-taken">Taken ${elderClock(record.recordedAt, timeZone)}</span>`;
  if (record?.status === "skipped") return `<span class="chip chip-skipped">Skipped</span>`;
  if (record?.status === "missed") return `<span class="chip chip-missed">Missed</span>`;
  if (nowMinutes === null) return `<span class="chip chip-upcoming">Not recorded</span>`;
  const due = toMinutes(time);
  if (nowMinutes >= due + 30) return `<span class="chip chip-late">Not taken</span>`;
  if (nowMinutes >= due) return `<span class="chip chip-due">Due now</span>`;
  return `<span class="chip chip-upcoming">Later</span>`;
}

// The medicine meter as a short label: "About 12 days left". Null if nobody counted the tablets.
function meterChip(stock) {
  if (!stock) return "";
  if (stock.daysLeft === 0) return `<span class="chip chip-missed">Running out today</span>`;
  const days = `About ${stock.daysLeft} day${stock.daysLeft === 1 ? "" : "s"} left`;
  return `<span class="chip ${stock.runningLow ? "chip-late" : "chip-upcoming"}">${days}</span>`;
}

// "Order by Thu 23 Oct" (or "Order today"), from the medicine meter
function orderByText(stock) {
  if (!stock) return "";
  const today = new Date().toLocaleDateString("en-CA"); // this phone's date, "2026-10-21"
  return stock.orderBy <= today ? "Order today" : `Order by ${shortDate(stock.orderBy)}`;
}

// A WhatsApp message to the family's own chemist, ready to send: wa.me opens WhatsApp with the text filled in.
// Nothing is sent until the caregiver presses Send in WhatsApp. It's free: it uses their own WhatsApp.
function chemistWhatsAppLink(elder, medicines, myName) {
  const lines = medicines.map((m) => {
    const month = Math.ceil(m.schedules.length * m.stock.perDose * 30);
    return `- ${m.name}${m.strength ? ` ${m.strength}` : ""}: ${month} tablets (1 month)`;
  });
  const hello = elder.chemist.name ? `Namaste ${elder.chemist.name},` : "Namaste,";
  const text = `${hello} please keep these medicines ready for ${elder.name}:\n${lines.join("\n")}\nThank you, ${myName}`;
  const number = elder.chemist.phone.replace(/\D/g, ""); // wa.me wants digits only, with the country code
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// ================================================================
// 4. Sign in / create account
// ================================================================
function showSignIn(isSignup) {
  signOutButton.hidden = true;
  show(isSignup ? "Create account" : "Sign in", `
    <section class="page-head">
      <h1>${isSignup ? "Create your family account" : "Sign in"}</h1>
      <p class="lede">${isSignup
        ? "Set up medicines for someone you care for, and be told if they miss a dose."
        : "Manage medicines for the people you look after."}</p>
    </section>
    <form id="auth-form" novalidate>
      ${isSignup ? `
        <div class="field"><label for="name">Your name</label><input type="text" id="name" autocomplete="name" required></div>
        <div class="field"><label for="phone">Mobile number</label><input type="tel" id="phone" autocomplete="tel" placeholder="+91 98765 43210">
          <span class="hint">For SMS and WhatsApp alerts.</span></div>` : ""}
      <div class="field"><label for="email">Email</label><input type="email" id="email" autocomplete="email" required></div>
      <div class="field"><label for="password">Password</label>
        <input type="password" id="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required>
        ${isSignup ? `<span class="hint">At least 10 characters.</span>` : ""}</div>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-wide" type="submit">${isSignup ? "Create account" : "Sign in"}</button>
    </form>
    <p>${isSignup ? `Already have an account? <a href="#/signin">Sign in</a>` : `New to GoldenDose? <a href="#/signup">Create an account</a>`}</p>`);

  const form = document.getElementById("auth-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = (id) => document.getElementById(id)?.value.trim();
    submitting(form, async () => {
      const reply = isSignup
        ? await api("POST", "/api/auth/signup", { name: value("name"), phone: value("phone") || null, email: value("email"), password: document.getElementById("password").value })
        : await api("POST", "/api/auth/login", { email: value("email"), password: document.getElementById("password").value });
      setToken(reply.token);
      go("#/");
    }, isSignup ? "Creating account…" : "Signing in…");
  });
}

// ================================================================
// 4b. My account: change my password, sign out everywhere
// ================================================================
async function showAccount() {
  const me = await api("GET", "/api/me");
  show("My account", `
    <section class="page-head">
      <a class="back" href="#/">All people</a>
      <h1>My account</h1>
      <p class="lede">${esc(me.name)} · ${esc(me.email)}</p>
    </section>
    <section>
      <h2>Change password</h2>
      <form id="password-form" novalidate>
        <div class="field"><label for="current-password">Current password</label>
          <input type="password" id="current-password" autocomplete="current-password" required></div>
        <div class="field"><label for="new-password">New password</label>
          <input type="password" id="new-password" autocomplete="new-password" required>
          <span class="hint">At least 10 characters. Your other phones and browsers will be signed out.</span></div>
        <p class="form-error" role="alert"></p>
        <p class="form-ok" role="status" id="password-ok"></p>
        <button class="btn btn-primary" type="submit">Change password</button>
      </form>
    </section>
    <section>
      <h2>Sign out everywhere</h2>
      <p>Signs you out on every phone and browser, this one too. Use it if a phone is lost.</p>
      <p class="form-error" role="alert" id="everywhere-error"></p>
      <button class="btn" type="button" id="sign-out-everywhere">Sign out everywhere</button>
    </section>`);

  const form = document.getElementById("password-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    document.getElementById("password-ok").textContent = "";
    submitting(form, async () => {
      await api("POST", "/api/auth/password", {
        currentPassword: document.getElementById("current-password").value,
        newPassword: document.getElementById("new-password").value,
      });
      form.reset();
      document.getElementById("password-ok").textContent = "Password changed. Your other phones and browsers were signed out.";
    });
  });

  document.getElementById("sign-out-everywhere").addEventListener("click", async () => {
    try {
      await api("POST", "/api/auth/logout-everywhere");
      setToken(null);
      go("#/signin");
    } catch (error) {
      document.getElementById("everywhere-error").textContent = error.message;
    }
  });
}

// ================================================================
// 5. Home: the people I look after
// ================================================================
async function showHome() {
  const [me, elders, attention] = await Promise.all([api("GET", "/api/me"), api("GET", "/api/elders"), api("GET", "/api/attention")]);
  // Whether each person's phone is connected, shown on their card
  const checkups = await Promise.all(elders.map((e) => api("GET", `/api/elders/${e.id}/checkup`).catch(() => null)));
  const phoneConnected = Object.fromEntries(elders.map((e, i) => [e.id, checkups[i]?.items.find((x) => x.key === "phone")?.ok]));
  // Urgent and today's items in full; the rest as one line per person, so the people list stays in view.
  const important = attention.filter((a) => a.severity === "urgent" || a.severity === "high");
  const more = elders
    .map((e) => ({ e, n: attention.filter((a) => a.elderId === e.id && a.severity === "medium").length }))
    .filter((x) => x.n > 0)
    .map(({ e, n }) => `<a class="more-link" href="#/elder/${e.id}">${n} more thing${n === 1 ? "" : "s"} worth a look for ${esc(e.name)} ›</a>`).join("");

  const cards = elders.map((e) => `
    <li><a class="card" href="#/elder/${e.id}">
      <span class="avatar" aria-hidden="true">${esc(e.name.slice(0, 1).toUpperCase())}</span>
      <span class="card-body"><span class="card-title">${esc(e.name)}</span>
        <span class="card-meta">${e.role === "owner" ? "You're the main caregiver" : "You're helping"}</span>
        ${phoneConnected[e.id] ? `<span class="card-meta phone-ok">✓ Phone connected</span>` : `<span class="card-meta">Phone not connected yet</span>`}</span>
      <span class="chevron" aria-hidden="true">›</span></a></li>`).join("");

  show("People", `
    <section class="page-head">
      <h1>Hello, ${esc(me.name.split(" ")[0])}</h1>
      <p class="lede">${elders.length ? "The people you look after" : "Add the first person you look after to get started."}</p>
    </section>
    ${important.length || more ? `<section><h2>Needs attention</h2>${important.length ? attentionList(important, { showName: elders.length > 1 }) : ""}${more}</section>` : ""}
    ${elders.length ? `<ul class="list">${cards}</ul>
      <p class="hint">To remove someone, open their page and scroll to the bottom.</p>` : ""}
    <section>
      <h2>Add a person</h2>
      <form id="add-elder" novalidate>
        <div class="field"><label for="elder-name">Their name</label>
          <input type="text" id="elder-name" placeholder="Kamala" required>
          <span class="hint">This is how the app greets them: "Good morning, Kamala".</span></div>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">Add person</button>
      </form>
    </section>
    <p><a href="#/account">My account: change password, sign out everywhere</a></p>`);

  const form = document.getElementById("add-elder");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitting(form, async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
      const elder = await api("POST", "/api/elders", { name: document.getElementById("elder-name").value, timezone });
      go(`#/elder/${elder.id}/setup`); // step by step: first medicine, their phone, alerts
    });
  });
}

// ================================================================
// 6. One person: today, medicines, their phone
// ================================================================
async function showElder(elderId) {
  const elder = await loadElder(elderId);
  const now = localParts(new Date(), elder.timezone);
  const [medicines, history, emergencies, me, attention, checkup] = await Promise.all([
    api("GET", `/api/elders/${elderId}/medicines`),
    api("GET", `/api/elders/${elderId}/history?from=${now.date}&to=${now.date}`),
    api("GET", `/api/elders/${elderId}/emergencies`),
    api("GET", "/api/me"),
    api("GET", `/api/elders/${elderId}/attention`),
    api("GET", `/api/elders/${elderId}/checkup`),
  ]);
  // Is the elder's phone connected already? Then the connection code is only for a new or replacement phone.
  const phoneConnected = checkup.items.find((i) => i.key === "phone")?.ok;
  const lastUsed = checkup.lastSeen ? timeAgo(checkup.lastSeen) : null;
  const othersCare = checkup.items.find((i) => i.key === "family")?.ok; // someone else in the family looks after them too
  // The emergency banner and the Running low box below have their own places on this page.
  const otherAttention = attention.filter((a) => a.kind !== "emergency" && a.kind !== "running-low");

  // An emergency button press in the last 24 hours goes right at the top.
  const recent = emergencies.find((e) => Date.now() - Date.parse(e.at) < 86_400_000);
  const emergencyBanner = recent ? `
    <section class="emergency-banner" role="alert">
      <h2>Emergency button pressed at ${elderClock(recent.at, elder.timezone)}</h2>
      ${recent.cancelledAt ? `<p>${esc(elder.name)} pressed "I'm OK" at ${elderClock(recent.cancelledAt, elder.timezone)}. Please still call to check.</p>`
        : `<p>Call ${esc(elder.name)} now.</p>`}
      ${recent.location ? `<a class="btn" href="https://maps.google.com/?q=${recent.location.latitude},${recent.location.longitude}" target="_blank" rel="noopener">See where on the map</a>` : ""}
    </section>` : "";

  // Medicines running low (about 5 days or less): one WhatsApp message to the chemist covers them all.
  const low = medicines.filter((m) => m.stock?.runningLow);
  const runningLow = low.length ? `
    <section class="running-low">
      <h2>Running low</h2>
      <ul class="list">${low.map((m) => `
        <li class="low-row"><span class="card-title">${esc(m.name)} ${m.strength ? `<span class="card-meta">${esc(m.strength)}</span>` : ""}</span>
          <span class="card-meta">About ${m.stock.tabletsLeft} tablets left · ${orderByText(m.stock)}</span> ${meterChip(m.stock)}
          <a href="#/elder/${elderId}/medicine/${m.id}">Bought more? Count again</a></li>`).join("")}
      </ul>
      ${elder.chemist.phone
        ? `<a class="btn btn-primary" href="${esc(chemistWhatsAppLink(elder, low, me.name.split(" ")[0]))}" target="_blank" rel="noopener">Order on WhatsApp from ${esc(elder.chemist.name || "your chemist")}</a>`
        : `<p class="hint">Add your chemist's WhatsApp number in <a href="#/elder/${elderId}/details">Language, hospital and chemist</a> to order in one tap.</p>`}
    </section>` : "";

  // Today's doses: every time of every medicine, matched with what was recorded.
  const doses = medicines
    .flatMap((m) => m.schedules.map((s) => ({ medicine: m, time: s.time })))
    .sort((a, b) => a.time.localeCompare(b.time));
  const recordFor = (dose) => history.find((h) => h.medicine.id === dose.medicine.id && h.time === dose.time);
  const takenCount = doses.filter((d) => recordFor(d)?.status === "taken").length;
  const missedCount = doses.filter((d) => recordFor(d)?.status === "missed").length;

  const todayRows = doses.map((d) => `
    <div class="dose-row">
      <span class="dose-time">${friendlyTime(d.time)}</span>
      <span class="dose-name">${esc(d.medicine.name)} <span class="card-meta">${esc(d.medicine.strength)}</span></span>
      ${statusChip(recordFor(d), d.time, now.minutes, elder.timezone)}
    </div>`).join("");

  const medicineCards = medicines.map((m) => `
    <li><a class="card" href="#/elder/${elderId}/medicine/${m.id}">
      <span class="pill-box">${pillPicture(m, 44)}</span>
      <span class="card-body"><span class="card-title">${esc(m.name)} ${m.strength ? `<span class="card-meta">${esc(m.strength)}</span>` : ""}</span>
        <span class="card-meta">${m.schedules.map((s) => friendlyTime(s.time)).join(", ")}</span>
        ${m.purpose ? `<span class="card-meta purpose">For: ${esc(m.purpose)}</span>` : `<span class="card-meta">What it's for: not filled in</span>`}
        ${m.instruction ? `<span class="card-meta">${esc(m.instruction)}</span>` : ""}
        ${m.stock ? `<span>${meterChip(m.stock)} <span class="card-meta">${orderByText(m.stock)}</span></span>` : ""}</span>
      <span class="chevron" aria-hidden="true">›</span></a></li>`).join("");

  show(elder.name, `
    <section class="page-head">
      <a class="back" href="#/">All people</a>
      <h1>${esc(elder.name)}</h1>
      ${doses.length ? `<div class="summary">
        <span class="chip ${takenCount ? "chip-taken" : "chip-upcoming"}">${takenCount} of ${doses.length} taken today</span>
        ${missedCount ? `<span class="chip chip-missed">${missedCount} missed</span>` : ""}</div>` : ""}
    </section>
    ${emergencyBanner}
    ${runningLow}
    ${otherAttention.length ? `<section><h2>Needs attention</h2>${attentionList(otherAttention)}</section>` : ""}

    <section>
      <div class="section-head"><h2>Today</h2><a href="#/elder/${elderId}/history">Last 7 days</a></div>
      ${doses.length ? `<div class="panel">${todayRows}</div>` : `<p class="empty">No medicines yet. Add the first one below.</p>`}
    </section>

    <section>
      <div class="section-head"><h2>Medicines</h2></div>
      ${medicines.length ? `<ul class="list">${medicineCards}</ul>` : ""}
      <a class="btn btn-primary" href="#/elder/${elderId}/add">Add a medicine</a>
    </section>

    <section id="phone-section">
      <h2>${esc(elder.name)}'s phone</h2>
      ${phoneConnected ? `
      <p class="phone-ok"><span aria-hidden="true">✓</span> Connected${lastUsed ? `. Last used ${lastUsed}.` : "."}</p>
      <div class="actions"><button class="btn btn-small" type="button" id="disconnect">Disconnect this phone</button></div>
      <div class="confirm" id="confirm-disconnect" hidden>
        <p><strong>Disconnect ${esc(elder.name)}'s phone?</strong></p>
        <p>It will stop showing ${esc(elder.name)}'s medicines and alarms straight away. Use this if the phone is lost, stolen or given away.
          You can connect a phone again any time with a new code.</p>
        <div class="actions">
          <button class="btn btn-danger" type="button" id="disconnect-yes">Yes, disconnect</button>
          <button class="btn" type="button" id="disconnect-no">Keep it connected</button>
        </div>
        <p class="form-error" role="alert" id="disconnect-error"></p>
      </div>
      <details class="new-phone">
        <summary>New or replacement phone?</summary>
        <p class="hint">Only if ${esc(elder.name)} gets another phone or tablet. The connected one keeps working.</p>
        <div class="actions"><button class="btn" type="button" id="make-code">Get a connection code</button></div>
      </details>` : `
      <p class="lede">Connect the phone or tablet ${esc(elder.name)} will use. You'll get a code to type on it once.</p>
      <div class="actions"><button class="btn" type="button" id="make-code">Get a connection code</button>
        <a class="btn" href="#/elder/${elderId}/setup">Step-by-step help</a></div>`}
      <div class="code-box" id="code-box" hidden aria-live="polite"></div>
    </section>

    <section>
      <h2>Records and reports</h2>
      <div class="link-grid">
        <a class="card" href="#/elder/${elderId}/health"><span class="card-body"><span class="card-title">Health records</span>
          <span class="card-meta">Blood reports, tests due, blood pressure, doctor visits</span></span></a>
        <a class="card" href="#/elder/${elderId}/report"><span class="card-body"><span class="card-title">Doctor visit report</span>
          <span class="card-meta">What was taken, missed and skipped. Print or share.</span></span></a>
        <a class="card" href="#/elder/${elderId}/prescriptions"><span class="card-body"><span class="card-title">Prescriptions</span>
          <span class="card-meta">Photos and PDFs from the doctor</span></span></a>
        <a class="card" href="#/elder/${elderId}/changes"><span class="card-body"><span class="card-title">Change history</span>
          <span class="card-meta">Who changed what, and why</span></span></a>
        <a class="card" href="#/elder/${elderId}/checkup"><span class="card-body"><span class="card-title">Setup check</span>
          <span class="card-meta">Is everything ready?</span></span></a>
      </div>
    </section>

    <section>
      <h2>Alerts and family</h2>
      <a class="card" href="#/elder/${elderId}/settings">
        <span class="card-body"><span class="card-title">How you're told about missed doses</span>
        <span class="card-meta">${[elder.myAlerts.sms && "SMS", elder.myAlerts.whatsapp && "WhatsApp", elder.myAlerts.app && "App"].filter(Boolean).join(", ") || "Off"}${elder.role === "owner" ? " · Invite family" : ""}</span></span>
        <span class="chevron" aria-hidden="true">›</span></a>
      <a class="card" href="#/elder/${elderId}/details">
        <span class="card-body"><span class="card-title">Language, hospital and chemist</span>
        <span class="card-meta">${esc((LANGUAGE_NAMES[elder.language] ?? "English").split(" (")[0])}${elder.hospital.phone ? ` · ${esc(elder.hospital.name || elder.hospital.phone)}` : " · No hospital set"}${elder.chemist.phone ? ` · ${esc(elder.chemist.name || "Chemist")}` : ""}</span></span>
        <span class="chevron" aria-hidden="true">›</span></a>
    </section>

    <section>
      <h2>Remove from my list</h2>
      <p class="lede">${othersCare
        ? `You'll stop seeing ${esc(elder.name)} and getting their alerts. The rest of the family keeps looking after them.`
        : `You're the only one looking after ${esc(elder.name)}, so removing them deletes everything about them.`}</p>
      <div class="actions"><button class="btn" type="button" id="remove-person">Remove ${esc(elder.name)}</button></div>
      <div class="confirm" id="confirm-remove" hidden>
        <p><strong>Remove ${esc(elder.name)} from your list?</strong></p>
        <p>${othersCare
          ? `You won't see their medicines or get their alerts any more. The others who look after ${esc(elder.name)} carry on as before.`
          : `${esc(elder.name)}'s medicines, history, prescriptions and photos will be deleted, and their phone disconnected. <strong>This can't be undone.</strong>`}</p>
        <div class="actions">
          <button class="btn btn-danger" type="button" id="remove-yes">${othersCare ? "Yes, remove from my list" : `Yes, delete ${esc(elder.name)}`}</button>
          <button class="btn" type="button" id="remove-no">Keep ${esc(elder.name)}</button>
        </div>
        <p class="form-error" role="alert" id="remove-error"></p>
      </div>
    </section>`);

  // Remove from my list (asks first)
  const removeBox = document.getElementById("confirm-remove");
  document.getElementById("remove-person").addEventListener("click", () => {
    removeBox.hidden = false;
    document.getElementById("remove-no").focus();
  });
  document.getElementById("remove-no").addEventListener("click", () => { removeBox.hidden = true; });
  document.getElementById("remove-yes").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api("DELETE", `/api/elders/${elderId}/me`);
      go("#/");
    } catch (error) {
      if (error.status === 401) return showError(error);
      document.getElementById("remove-error").textContent = error.message;
      event.currentTarget.disabled = false;
    }
  });

  // Disconnect this phone (asks first)
  if (phoneConnected) {
    const confirmBox = document.getElementById("confirm-disconnect");
    document.getElementById("disconnect").addEventListener("click", () => {
      confirmBox.hidden = false;
      document.getElementById("disconnect-no").focus();
    });
    document.getElementById("disconnect-no").addEventListener("click", () => { confirmBox.hidden = true; });
    document.getElementById("disconnect-yes").addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        await api("DELETE", `/api/elders/${elderId}/devices`);
        await showElder(elderId); // now shows "Connect the phone…" with the code button
      } catch (error) {
        if (error.status === 401) return showError(error);
        document.getElementById("disconnect-error").textContent = error.message;
        event.currentTarget.disabled = false;
      }
    });
  }

  document.getElementById("make-code").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const box = document.getElementById("code-box");
    button.disabled = true;
    try {
      const { code, expiresAt } = await api("POST", `/api/elders/${elderId}/pairing-code`);
      box.innerHTML = await connectionStepsHTML(elder, code, expiresAt);
      watchPhone(elderId, () => {
        // Connected: the section says so straight away, no reload needed
        document.getElementById("phone-section").innerHTML = `
          <h2>${esc(elder.name)}'s phone</h2>
          <p class="phone-ok connected-now"><span aria-hidden="true">✓</span> Connected! ${esc(elder.name)}'s phone is ready.</p>`;
      });
      box.hidden = false;
      button.textContent = "Get a new code";
    } catch (error) {
      if (error.status === 401) return showError(error);
      box.innerHTML = `<p class="form-error">${esc(error.message)}</p>`;
      box.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}

// ================================================================
// 7. Add or change a medicine
// ================================================================
async function showMedicineForm(elderId, medicineId, returnTo = null) {
  const elder = await loadElder(elderId);
  let medicine = null;
  if (medicineId) {
    const all = await api("GET", `/api/elders/${elderId}/medicines?includeStopped=true`);
    medicine = all.find((m) => m.id === medicineId);
    if (!medicine) throw Object.assign(new Error("That medicine doesn't exist."), { status: 404 });
  }
  const m = medicine ?? { name: "", strength: "", instruction: "", purpose: "", hardToGet: false, pillShape: "round", pillColor: "#FFFFFF", pillColor2: null, photoUrl: null, schedules: [] };
  const times = m.schedules.length ? m.schedules.map((s) => s.time) : ["08:00"];

  const colours = [...COLOURS];
  if (!colours.some(([, hex]) => hex === m.pillColor)) colours.push(["Current", m.pillColor]);
  const colourChoices = (name, selected) => colours.map(([label, hex]) => `
    <label class="choice"><input type="radio" name="${name}" value="${hex}" ${hex === selected ? "checked" : ""}>
      <span><span class="swatch" style="background:${esc(hex)}"></span>${label}</span></label>`).join("");

  const timeRow = (value) => `
    <div class="time-row"><input type="time" value="${esc(value)}" aria-label="Time" required>
      <button class="btn btn-small" type="button" data-remove-time>Remove</button></div>`;

  show(medicine ? `Change ${medicine.name}` : "Add a medicine", `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>${medicine ? `Change ${esc(medicine.name)}` : `Add a medicine for ${esc(elder.name)}`}</h1>
      ${medicine && !medicine.active ? `<p class="chip chip-skipped">Stopped. Saving will start it again.</p>` : ""}
    </section>

    <form id="medicine-form" novalidate>
      <div class="field"><label for="name">Medicine name</label>
        <input type="text" id="name" value="${esc(m.name)}" placeholder="Metformin" required></div>
      <div class="field"><label for="strength">Strength</label>
        <input type="text" id="strength" value="${esc(m.strength)}" placeholder="500 mg"></div>
      <div class="field"><label for="instruction">Instruction</label>
        <input type="text" id="instruction" value="${esc(m.instruction)}" placeholder="Take one white tablet after food">
        <span class="hint">${esc(elder.name)}'s app reads this aloud. Mention the colour and when to take it.</span></div>
      <div class="field"><label for="purpose">What it's for</label>
        <input type="text" id="purpose" value="${esc(m.purpose)}" placeholder="Diabetes (blood sugar)">
        <span class="hint">As the doctor said. ${esc(elder.name)}'s app shows it under the name.</span>
        <div class="suggestion" id="purpose-suggestion" hidden aria-live="polite"></div></div>

      <fieldset>
        <legend>Times each day</legend>
        <div id="times">${times.map(timeRow).join("")}</div>
        <button class="btn btn-small" type="button" id="add-time">Add another time</button>
      </fieldset>

      <fieldset>
        <legend>Medicine meter (optional)</legend>
        <span class="hint">Count the tablets once; GoldenDose counts down at each dose time and tells you when to order. Count again when you buy more.</span>
          ${m.stock ? `<p class="meter-now"><strong>Now: about ${m.stock.tabletsLeft} tablets, ${m.stock.daysLeft} days. ${orderByText(m.stock)}.</strong></p>` : ""}
        <div class="field"><label for="stock">Tablets in hand now</label>
          <input type="number" id="stock" min="0" max="5000" step="0.5" inputmode="decimal" placeholder="${m.stock ? "Leave empty to keep counting" : "For example 30"}"></div>
        <div class="field"><label for="per-dose">Tablets in each dose</label>
          <input type="number" id="per-dose" min="0.25" max="20" step="0.25" inputmode="decimal" value="${m.stock ? m.stock.perDose : 1}"></div>
        <p class="meter-preview" id="meter-preview" aria-live="polite" hidden></p>
        <label class="check-row" for="hard-to-get"><input type="checkbox" id="hard-to-get" ${m.hardToGet ? "checked" : ""}>
          <span>Hard to get<br><span class="hint">The chemist often has to order it. GoldenDose will warn you a week earlier.</span></span></label>
      </fieldset>

      <fieldset>
        <legend>Photo of the pill or strip</legend>
        <span class="hint">People recognise medicine by how it looks. A clear photo helps most.</span>
        <div class="photo-row">
          <div class="photo-preview" id="photo-preview">${pillPicture(m, 72)}</div>
          <label class="btn" for="photo">${m.photoUrl ? "Change photo" : "Take or choose a photo"}</label>
          <input type="file" id="photo" accept="image/*" capture="environment" class="sr-only">
        </div>
      </fieldset>

      <fieldset>
        <legend>Shape (used when there's no photo)</legend>
        <div class="choice-grid">${SHAPES.map(([value, label]) => `
          <label class="choice"><input type="radio" name="shape" value="${value}" ${value === m.pillShape ? "checked" : ""}>
            <span>${pillSVG({ pillShape: value, pillColor: "#FFFFFF", pillColor2: "#FFFFFF" }, 40)}${label}</span></label>`).join("")}
        </div>
      </fieldset>

      <fieldset>
        <legend>Colour</legend>
        <div class="choice-grid">${colourChoices("colour", m.pillColor)}</div>
      </fieldset>

      <fieldset id="colour2-set" ${m.pillShape === "capsule" ? "" : "hidden"}>
        <legend>Second colour of the capsule</legend>
        <div class="choice-grid">${colourChoices("colour2", m.pillColor2 ?? "#FFFFFF")}</div>
      </fieldset>

      <div class="field"><label for="reason">Why${medicine ? " the change" : ""}? (optional)</label>
        <input type="text" id="reason" placeholder="${medicine ? "Doctor changed the dose on 3 Oct" : "New prescription from Dr. Rao"}">
        <span class="hint">Saved in the change history, so the whole family knows.</span></div>

      <p class="form-error" role="alert"></p>
      <p class="form-ok" role="status" id="medicine-ok"></p>
      <button class="btn btn-primary btn-wide" type="submit">${medicine ? "Save changes" : "Add medicine"}</button>
    </form>

    ${medicine && medicine.active ? `
    <section>
      <h2>Stop this medicine</h2>
      <p class="lede">${esc(elder.name)} won't be reminded any more. Past records are kept.</p>
      <div class="actions"><button class="btn" type="button" id="stop">Stop ${esc(medicine.name)}</button></div>
      <div class="confirm" id="confirm-stop" hidden>
        <p><strong>Stop ${esc(medicine.name)}?</strong></p>
        <div class="field"><label for="stop-reason">Why? (optional)</label>
          <input type="text" id="stop-reason" placeholder="Doctor stopped it on 3 Oct"></div>
        <div class="actions">
          <button class="btn btn-danger" type="button" id="stop-yes">Yes, stop it</button>
          <button class="btn" type="button" id="stop-no">Keep it</button>
        </div>
      </div>
    </section>` : ""}`);

  const form = document.getElementById("medicine-form");
  const timesBox = document.getElementById("times");
  const photoInput = document.getElementById("photo");
  let photoFile = null;

  // "Usually used for…" under What it's for, looked up from the name (general information only)
  const nameInput = document.getElementById("name");
  const purposeInput = document.getElementById("purpose");
  const suggestion = document.getElementById("purpose-suggestion");
  let lookupTimer;
  const suggest = async () => {
    const typed = nameInput.value.trim();
    if (typed.length < 3) { suggestion.hidden = true; return; }
    try {
      const info = await api("GET", `/api/medicine-info?name=${encodeURIComponent(typed)}`);
      if (!info || nameInput.value.trim() !== typed || purposeInput.value.trim() === info.usedFor) { suggestion.hidden = true; return; }
      suggestion.innerHTML = `
        <p><strong>${esc(info.matched)}</strong>${info.matched.toLowerCase() !== info.generic.toLowerCase() ? ` (${esc(info.generic)})` : ""} is usually used for: <strong>${esc(info.usedFor)}</strong></p>
        <p class="hint">${esc(info.note)}</p>
        <button class="btn btn-small" type="button" id="use-suggestion">Use this</button>`;
      suggestion.hidden = false;
      document.getElementById("use-suggestion")?.addEventListener("click", () => {
        purposeInput.value = info.usedFor;
        suggest();
      });
    } catch { suggestion.hidden = true; }
  };
  nameInput.addEventListener("input", () => { clearTimeout(lookupTimer); lookupTimer = setTimeout(suggest, 400); });
  if (m.name) suggest();

  // As the family types a count: "20 tablets, 2 a day: about 10 days. Order by Sun 26 Oct."
  const meterPreview = () => {
    const box = document.getElementById("meter-preview");
    const count = Number(document.getElementById("stock").value);
    const perDose = Number(document.getElementById("per-dose").value) || 1;
    const perDay = timesBox.querySelectorAll("input[type=time]").length * perDose;
    if (!document.getElementById("stock").value || !(count >= 0) || !perDay) { box.hidden = true; return; }
    const days = Math.floor(count / perDay);
    const ahead = (elder.chemist.leadDays ?? 2) + 3 + (document.getElementById("hard-to-get").checked ? 7 : 0);
    const orderBy = addDays(localParts(new Date(), elder.timezone).date, Math.max(0, days - ahead));
    box.textContent = `${count} tablet${count === 1 ? "" : "s"}, ${perDay} a day: about ${days} day${days === 1 ? "" : "s"}. ` +
      (days <= ahead ? "Time to order now." : `Order by ${shortDate(orderBy)}.`);
    box.hidden = false;
  };
  ["stock", "per-dose", "hard-to-get"].forEach((id) => document.getElementById(id).addEventListener("input", meterPreview));
  timesBox.addEventListener("click", () => setTimeout(meterPreview));

  document.getElementById("add-time").addEventListener("click", () => {
    timesBox.insertAdjacentHTML("beforeend", timeRow("12:00"));
    timesBox.lastElementChild.querySelector("input").focus();
  });
  timesBox.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-time]")) return;
    if (timesBox.children.length === 1) return; // keep at least one
    event.target.closest(".time-row").remove();
  });

  // Keep the preview in step with the chosen shape and colours (until a photo is chosen).
  form.addEventListener("change", (event) => {
    if (event.target.name === "shape") {
      document.getElementById("colour2-set").hidden = event.target.value !== "capsule";
    }
    if (["shape", "colour", "colour2"].includes(event.target.name) && !photoFile && !m.photoUrl) {
      document.getElementById("photo-preview").innerHTML = pillSVG({
        pillShape: form.querySelector("input[name=shape]:checked").value,
        pillColor: form.querySelector("input[name=colour]:checked").value,
        pillColor2: form.querySelector("input[name=colour2]:checked").value,
      }, 72);
    }
  });

  photoInput.addEventListener("change", () => {
    photoFile = photoInput.files[0] ?? null;
    if (photoFile) {
      document.getElementById("photo-preview").innerHTML = `<img src="${URL.createObjectURL(photoFile)}" alt="New photo">`;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const shape = form.querySelector("input[name=shape]:checked").value;
    const body = {
      name: document.getElementById("name").value,
      strength: document.getElementById("strength").value,
      instruction: document.getElementById("instruction").value,
      purpose: document.getElementById("purpose").value,
      hardToGet: document.getElementById("hard-to-get").checked,
      reason: document.getElementById("reason").value,
      times: [...timesBox.querySelectorAll("input[type=time]")].map((input) => input.value).filter(Boolean),
      pillShape: shape,
      pillColor: form.querySelector("input[name=colour]:checked").value,
      pillColor2: shape === "capsule" ? form.querySelector("input[name=colour2]:checked").value : null,
    };
    submitting(form, async () => {
      const saved = medicine
        ? await api("PUT", `/api/medicines/${medicine.id}`, body)
        : await api("POST", `/api/elders/${elderId}/medicines`, body);
      // A helper's change while the family asked for approval: the medicine itself doesn't change until
      // the main caregiver says yes. That includes how the pill looks (shape, colour, photo).
      // A tablet count isn't a change of medicine, so that still saves.
      const pending = saved.pending ? saved : null;
      const medicineId = pending ? medicine?.id : saved.id;
      if (!pending) medicine = saved; // if the photo fails and Save is pressed again, change this medicine instead of adding a copy
      const stock = document.getElementById("stock").value;
      if (stock !== "" && medicineId) {
        await api("PUT", `/api/medicines/${medicineId}/stock`, { tabletsLeft: Number(stock), perDose: Number(document.getElementById("per-dose").value || 1) });
      }
      let photoPending = null;
      if (photoFile && medicineId) {
        try {
          const reply = await api("POST", `/api/medicines/${medicineId}/photo`, undefined, { raw: await shrinkPhoto(photoFile) });
          if (reply?.pending) photoPending = reply; // a helper's new photo also waits for the main caregiver
        } catch (error) {
          // The medicine is saved. Only the photo failed, so say exactly that.
          throw Object.assign(new Error(`The medicine was saved, but the photo wasn't: ${error.message}`), { status: error.status });
        }
      }
      const waitingFor = [pending, photoPending].filter(Boolean);
      if (waitingFor.length) {
        document.getElementById("medicine-ok").textContent = `Sent for approval: ${waitingFor.map((w) => w.summary).join("; ")}. The main caregiver has been told.`;
        return;
      }
      go(returnTo ?? `#/elder/${elderId}`);
    });
  });

  if (medicine?.active) {
    document.getElementById("stop").addEventListener("click", () => { document.getElementById("confirm-stop").hidden = false; });
    document.getElementById("stop-no").addEventListener("click", () => { document.getElementById("confirm-stop").hidden = true; });
    document.getElementById("stop-yes").addEventListener("click", async () => {
      try {
        const reason = document.getElementById("stop-reason").value.trim();
        const reply = await api("DELETE", `/api/medicines/${medicine.id}${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`);
        if (reply?.pending) {
          document.getElementById("confirm-stop").innerHTML = `<p class="form-ok">Sent for approval: ${esc(reply.summary)}.</p>`;
          return;
        }
        go(`#/elder/${elderId}`);
      } catch (error) {
        showError(error);
      }
    });
  }
}

// Phone photos are large (often 4 MB or more). Shrink to at most 1024 pixels wide as a JPEG,
// so it uploads quickly and loads fast on Kamala's phone.
async function shrinkPhoto(file, maxSize = 1024) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

// ================================================================
// 8. History: the last 7 days
// ================================================================
async function showHistory(elderId) {
  const elder = await loadElder(elderId);
  const today = localParts(new Date(), elder.timezone).date;
  const from = addDays(today, -6);
  const history = await api("GET", `/api/elders/${elderId}/history?from=${from}&to=${today}`);

  const days = [];
  for (let date = today; date >= from; date = addDays(date, -1)) days.push(date);

  const dayBlocks = days.map((date) => {
    const rows = history.filter((h) => h.date === date);
    const taken = rows.filter((r) => r.status === "taken").length;
    const label = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : prettyDate(date);
    return `
      <section class="day">
        <div class="section-head"><h2>${label}</h2>${rows.length ? `<span class="card-meta">${taken} of ${rows.length} taken</span>` : ""}</div>
        ${rows.length ? `<div class="panel">${rows.map((r) => `
          <div class="dose-row">
            <span class="dose-time">${friendlyTime(r.time)}</span>
            <span class="dose-name">${esc(r.medicine.name)} <span class="card-meta">${esc(r.medicine.strength)}</span></span>
            ${statusChip(r, r.time, null, elder.timezone)}
          </div>`).join("")}</div>` : `<p class="empty">Nothing recorded.</p>`}
      </section>`;
  }).join("");

  show(`${elder.name}: last 7 days`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Last 7 days</h1>
    </section>
    ${dayBlocks}`);
}

// ================================================================
// 9. Settings: my alerts, and inviting family
// ================================================================
async function showSettings(elderId) {
  const elder = await loadElder(elderId);
  const a = elder.myAlerts;
  const check = (id, label, on, hint) => `
    <label class="check-row" for="${id}"><input type="checkbox" id="${id}" ${on ? "checked" : ""}>
      <span>${label}${hint ? `<br><span class="hint">${hint}</span>` : ""}</span></label>`;

  show(`${elder.name}: alerts and family`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Alerts and family</h1>
    </section>

    <section>
      <h2>If ${esc(elder.name)} misses a dose</h2>
      <p class="lede">You'll be told 30 minutes after the dose was due. Choose how.</p>
      <form id="alerts-form">
        <fieldset>
          <legend class="sr-only">Alert channels</legend>
          ${check("sms", "SMS", a.sms)}
          ${check("whatsapp", "WhatsApp", a.whatsapp)}
          ${check("app", "App notification", a.app)}
        </fieldset>
        <p class="hint">Test version: alerts appear in the backend's terminal window, not on phones yet.</p>
        <p class="form-error" role="alert"></p>
        <p class="form-ok" role="status" id="alerts-ok"></p>
        <button class="btn btn-primary" type="submit">Save</button>
      </form>
    </section>

    ${elder.role === "owner" ? `
    <section>
      <h2>Invite family</h2>
      <p class="lede">They'll see ${esc(elder.name)}'s medicines and can be alerted too. They need a GoldenDose account first.</p>
      <form id="invite-form" novalidate>
        <div class="field"><label for="invite-email">Their email</label><input type="email" id="invite-email" required></div>
        <div class="field"><label for="invite-role">What can they do?</label>
          <select id="invite-role">
            <option value="helper">Helper: see and change medicines</option>
            <option value="owner">Main caregiver: also invite others</option>
          </select></div>
        <p class="form-error" role="alert"></p>
        <p class="form-ok" role="status" id="invite-ok"></p>
        <button class="btn btn-primary" type="submit">Invite</button>
      </form>
    </section>` : ""}`);

  const alertsForm = document.getElementById("alerts-form");
  alertsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const ok = document.getElementById("alerts-ok");
    ok.textContent = "";
    submitting(alertsForm, async () => {
      await api("PUT", `/api/elders/${elderId}/my-alerts`, {
        sms: document.getElementById("sms").checked,
        whatsapp: document.getElementById("whatsapp").checked,
        app: document.getElementById("app").checked,
      });
      ok.textContent = "Saved";
    });
  });

  const inviteForm = document.getElementById("invite-form");
  inviteForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const ok = document.getElementById("invite-ok");
    ok.textContent = "";
    submitting(inviteForm, async () => {
      const reply = await api("POST", `/api/elders/${elderId}/caregivers`, {
        email: document.getElementById("invite-email").value,
        role: document.getElementById("invite-role").value,
      });
      ok.textContent = `${reply.caregiver.name} can now see ${elder.name}'s medicines.`;
      document.getElementById("invite-email").value = "";
    });
  });
}

// ================================================================
// 10. Language, emergency hospital and chemist
// ================================================================
async function showDetails(elderId) {
  const elder = await loadElder(elderId);
  const options = Object.entries(LANGUAGE_NAMES).map(([code, name]) =>
    `<option value="${code}" ${code === elder.language ? "selected" : ""}>${esc(name)}</option>`).join("");

  show(`${elder.name}: language, hospital and chemist`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Language, hospital and chemist</h1>
      <p class="lede">And how changes are approved.</p>
    </section>

    <form id="details-form" novalidate>
      <section>
        <h2>${esc(elder.name)}'s language</h2>
        <div class="field"><label for="language">Language of ${esc(elder.name)}'s app</label>
          <select id="language">${options}</select>
          <span class="hint">Buttons and messages on ${esc(elder.name)}'s phone change to this language. Medicine names and instructions show exactly as you type them, so you can type them in this language too.</span></div>
      </section>

      <section>
        <h2>In an emergency</h2>
        <p class="lede">${esc(elder.name)}'s emergency button tells every family member at once, and offers to call the ambulance (108). Add a hospital to call as well.</p>
        <div class="field"><label for="hospital-name">Hospital name</label>
          <input type="text" id="hospital-name" value="${esc(elder.hospital.name)}" placeholder="City Hospital"></div>
        <div class="field"><label for="hospital-phone">Hospital phone number</label>
          <input type="tel" id="hospital-phone" value="${esc(elder.hospital.phone)}" placeholder="+91 80 2222 3333">
          <span class="hint">Use its emergency (casualty) number if it has one.</span></div>
      </section>

      <section>
        <h2>Your chemist</h2>
        <p class="lede">When a medicine is running low, you can send this chemist the list on WhatsApp in one tap.</p>
        <div class="field"><label for="chemist-name">Chemist's name</label>
          <input type="text" id="chemist-name" value="${esc(elder.chemist.name)}" placeholder="Sharma Medical Store"></div>
        <div class="field"><label for="chemist-phone">Chemist's WhatsApp number</label>
          <input type="tel" id="chemist-phone" value="${esc(elder.chemist.phone)}" placeholder="+91 98450 11111">
          <span class="hint">Include the country code (+91 for India).</span></div>
        <div class="field"><label for="chemist-days">Days the chemist needs to get medicine ready</label>
          <input type="number" id="chemist-days" min="0" max="30" step="1" inputmode="numeric" value="${elder.chemist.leadDays ?? 2}">
          <span class="hint">GoldenDose tells you to order this many days ahead, plus 3 spare days. Usually 1 or 2.</span></div>
      </section>

      ${elder.role === "owner" ? `
      <section>
        <h2>Approving medicine changes</h2>
        <label class="check-row" for="require-approval"><input type="checkbox" id="require-approval" ${elder.requireApproval ? "checked" : ""}>
          <span>Helpers' changes need my OK<br><span class="hint">When a helper adds, changes or stops a medicine, it waits until you approve it. Useful when several people share the care.</span></span></label>
      </section>` : elder.requireApproval ? `<p class="hint">Medicine changes you make are sent to the main caregiver for approval.</p>` : ""}

      <p class="form-error" role="alert"></p>
      <p class="form-ok" role="status" id="details-ok"></p>
      <button class="btn btn-primary" type="submit">Save</button>
    </form>`);

  const form = document.getElementById("details-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const ok = document.getElementById("details-ok");
    ok.textContent = "";
    const value = (id) => document.getElementById(id).value.trim();
    submitting(form, async () => {
      await api("PUT", `/api/elders/${elderId}/profile`, {
        language: value("language"),
        hospital: { name: value("hospital-name"), phone: value("hospital-phone") },
        chemist: { name: value("chemist-name"), phone: value("chemist-phone"), leadDays: Number(value("chemist-days") || 2) },
        ...(elder.role === "owner" ? { requireApproval: document.getElementById("require-approval").checked } : {}),
      });
      ok.textContent = "Saved";
    });
  });
}

// ================================================================
// 11. Prescriptions: photos and PDFs from the doctor
// ================================================================
// The files are private, so they're fetched with the sign-in token and shown from memory ("blob" addresses).
async function prescriptionFile(p) {
  return URL.createObjectURL(await api("GET", p.fileUrl, undefined, { blob: true }));
}

async function showPrescriptions(elderId) {
  const elder = await loadElder(elderId);
  const list = await api("GET", `/api/elders/${elderId}/prescriptions`);

  const detailsForm = (p) => `
    <form class="prescription-form" data-id="${p.id}" hidden novalidate>
      <div class="field"><label for="doctor-${p.id}">Doctor</label><input type="text" id="doctor-${p.id}" value="${esc(p.doctor)}" placeholder="Dr. Rao"></div>
      <div class="field"><label for="date-${p.id}">Date on the prescription</label><input type="date" id="date-${p.id}" value="${esc(p.issuedOn ?? "")}"></div>
      <div class="field"><label for="note-${p.id}">Note</label><input type="text" id="note-${p.id}" value="${esc(p.note)}" placeholder="Sugar review. Next visit in 3 months."></div>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Save details</button>
    </form>`;

  const cards = list.map((p) => `
    <li class="card prescription" data-id="${p.id}">
      <span class="prescription-thumb" data-thumb="${p.id}">${p.kind === "pdf" ? `<span class="pdf-badge">PDF</span>` : ""}</span>
      <span class="card-body">
        <span class="card-title">${p.doctor ? esc(p.doctor) : "Prescription"}${p.issuedOn ? ` · ${shortDate(p.issuedOn)}` : ""}</span>
        ${p.note ? `<span class="card-meta">${esc(p.note)}</span>` : ""}
        <span class="card-meta">Added by ${esc(p.uploadedBy ?? "someone")} on ${elderMoment(p.uploadedAt, elder.timezone)}</span>
        <span class="actions">
          <button class="btn btn-small" type="button" data-open="${p.id}">Open</button>
          <button class="btn btn-small" type="button" data-edit="${p.id}">${p.doctor || p.issuedOn ? "Edit details" : "Add doctor and date"}</button>
          <button class="btn btn-small" type="button" data-remove="${p.id}">Remove</button>
        </span>
        <span class="confirm" data-confirm="${p.id}" hidden>
          <strong>Remove this prescription? It can't be undone.</strong>
          <span class="actions"><button class="btn btn-danger btn-small" type="button" data-remove-yes="${p.id}">Yes, remove</button>
          <button class="btn btn-small" type="button" data-remove-no="${p.id}">Keep it</button></span>
        </span>
        ${detailsForm(p)}
      </span>
    </li>`).join("");

  show(`${elder.name}: prescriptions`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Prescriptions</h1>
      <p class="lede">Keep a photo of every prescription here, so it's at hand at the chemist or the next doctor's visit. Only ${esc(elder.name)}'s family can see them.</p>
    </section>
    <section>
      <div class="actions">
        <label class="btn btn-primary" for="take-photo">Take a photo</label>
        <input type="file" id="take-photo" accept="image/*" capture="environment" class="sr-only">
        <label class="btn" for="choose-file">Choose a photo or PDF</label>
        <input type="file" id="choose-file" accept="image/*,application/pdf" class="sr-only">
      </div>
      <p class="form-error" role="alert" id="upload-error"></p>
      <p class="form-ok" role="status" id="upload-ok"></p>
    </section>
    <section>
      ${list.length ? `<ul class="list">${cards}</ul>` : `<p class="empty">No prescriptions yet.</p>`}
    </section>`);

  // Thumbnails for photos
  for (const p of list.filter((p) => p.kind !== "pdf")) {
    prescriptionFile(p).then((url) => {
      const box = view.querySelector(`[data-thumb="${p.id}"]`);
      if (box) box.innerHTML = `<img src="${url}" alt="Prescription${p.doctor ? ` from ${esc(p.doctor)}` : ""}">`;
    }).catch(() => {});
  }

  const upload = async (input) => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const error = document.getElementById("upload-error");
    const ok = document.getElementById("upload-ok");
    error.textContent = "";
    ok.textContent = "Uploading…";
    try {
      // Photos are made smaller (but still sharp enough to read); PDFs are sent as they are.
      const body = file.type === "application/pdf" ? file : await shrinkPhoto(file, 2000);
      const saved = await api("POST", `/api/elders/${elderId}/prescriptions`, undefined, { raw: body });
      await showPrescriptions(elderId);
      const form = view.querySelector(`.prescription-form[data-id="${saved.id}"]`);
      form.hidden = false; // straight away: who wrote it, and when
      form.querySelector("input").focus();
    } catch (e) {
      if (e.status === 401) return showError(e);
      ok.textContent = "";
      error.textContent = e.message;
    }
  };
  document.getElementById("take-photo").addEventListener("change", (e) => upload(e.target));
  document.getElementById("choose-file").addEventListener("change", (e) => upload(e.target));

  view.onclick = async (event) => { // onclick, not addEventListener: redrawing the page replaces it instead of adding another
    const t = event.target;
    const p = list.find((x) => String(x.id) === (t.dataset.open ?? t.dataset.edit ?? t.dataset.remove ?? t.dataset.removeYes ?? t.dataset.removeNo));
    if (!p) return;
    if (t.dataset.open) {
      const tab = window.open("", "_blank"); // open the tab now, while the tap still counts, then fill it
      try {
        const url = await prescriptionFile(p);
        if (tab) tab.location = url; else location.href = url;
      } catch (e) { tab?.close(); showError(e); }
    } else if (t.dataset.edit) {
      const form = view.querySelector(`.prescription-form[data-id="${p.id}"]`);
      form.hidden = !form.hidden;
    } else if (t.dataset.remove) {
      view.querySelector(`[data-confirm="${p.id}"]`).hidden = false;
    } else if (t.dataset.removeNo) {
      view.querySelector(`[data-confirm="${p.id}"]`).hidden = true;
    } else if (t.dataset.removeYes) {
      try { await api("DELETE", `/api/prescriptions/${p.id}`); await showPrescriptions(elderId); } catch (e) { showError(e); }
    }
  };
  view.querySelectorAll(".prescription-form").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = form.dataset.id;
    submitting(form, async () => {
      await api("PUT", `/api/prescriptions/${id}`, {
        doctor: document.getElementById(`doctor-${id}`).value,
        issuedOn: document.getElementById(`date-${id}`).value || null,
        note: document.getElementById(`note-${id}`).value,
      });
      await showPrescriptions(elderId);
    });
  }));
}

// ================================================================
// 12. The doctor visit report
// ================================================================
async function showReport(elderId, days = 30) {
  const elder = await loadElder(elderId);
  const to = localParts(new Date(), elder.timezone).date;
  const from = addDays(to, -(days - 1));
  const r = await api("GET", `/api/elders/${elderId}/report?from=${from}&to=${to}`);
  const t = r.totals;
  const recorded = t.taken + t.skipped + t.missed;
  const lateWords = (m) => (m === null ? "–" : m <= 10 ? "On time" : `About ${m} min after`);

  const rows = r.medicines.map((m) => `
    <tr role="row">
      <th scope="row" role="rowheader">${esc(m.name)} ${esc(m.strength)}${m.stillTaking ? "" : `<br><span class="hint">Stopped</span>`}</th>
      <td role="cell" data-label="For">${esc(m.purpose || "–")}</td>
      <td role="cell" data-label="Times">${m.times.map(friendlyTime).join(", ") || "–"}</td>
      <td role="cell" data-label="Taken">${m.taken}</td><td role="cell" data-label="Missed">${m.missed}</td><td role="cell" data-label="Skipped">${m.skipped}</td>
      <td role="cell" data-label="Taken %"><strong>${m.takenPercent ?? "–"}${m.takenPercent === null ? "" : "%"}</strong></td>
      <td role="cell" data-label="Usually taken">${lateWords(m.usuallyTakenMinutesLate)}</td>
    </tr>`).join("");

  const bars = r.days.map((d) => {
    const pct = d.total ? Math.round((100 * d.taken) / d.total) : null;
    return `<span class="bar ${pct === null ? "bar-none" : pct === 100 ? "bar-all" : pct >= 50 ? "bar-most" : "bar-few"}"
      style="--h:${pct === null ? 8 : Math.max(8, pct)}%" title="${shortDate(d.date)}: ${d.total ? `${d.taken} of ${d.total} taken` : "nothing recorded"}"></span>`;
  }).join("");

  const summaryText = [
    `GoldenDose report for ${r.elder.name}, ${shortDate(from)} to ${shortDate(to)}`,
    `Taken: ${t.takenPercent ?? 0}% (${t.taken} of ${recorded} recorded doses). Missed: ${t.missed}. Skipped: ${t.skipped}.`,
    ...r.medicines.map((m) => `- ${m.name} ${m.strength}${m.purpose ? ` (${m.purpose})` : ""}: ${m.takenPercent ?? "–"}% taken, ${m.missed} missed`),
    r.emergencies.length ? `Emergency button pressed ${r.emergencies.length} time(s).` : "",
  ].filter(Boolean).join("\n");

  show(`${elder.name}: doctor visit report`, `
    <section class="page-head no-print">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Doctor visit report</h1>
      <p class="lede">Show this to the doctor, print it, or share it.</p>
      <div class="field"><label for="period">Period</label>
        <select id="period">${[30, 60, 90].map((n) => `<option value="${n}" ${n === days ? "selected" : ""}>Last ${n} days</option>`).join("")}</select></div>
      <div class="actions">
        <button class="btn btn-primary" type="button" id="print">Print or save as PDF</button>
        <button class="btn" type="button" id="csv">Download spreadsheet</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(summaryText)}" target="_blank" rel="noopener">Share summary on WhatsApp</a>
      </div>
    </section>

    <article class="report">
      <header class="report-head">
        <p class="report-brand">GoldenDose · Medicine report</p>
        <h2>${esc(r.elder.name)}</h2>
        <p>${shortDate(from)} to ${shortDate(to)} (${days} days) · Made on ${shortDate(to)}</p>
      </header>

      <section class="report-totals">
        <div><span class="big">${t.takenPercent ?? "–"}${t.takenPercent === null ? "" : "%"}</span><span>taken</span></div>
        <div><span class="big">${t.taken}</span><span>doses taken</span></div>
        <div><span class="big">${t.missed}</span><span>missed</span></div>
        <div><span class="big">${t.skipped}</span><span>skipped</span></div>
      </section>

      <section>
        <h3>Each day</h3>
        <div class="bars" role="img" aria-label="Share of doses taken each day">${bars}</div>
        <p class="hint">Green: all taken. Light green: most taken. Orange: fewer than half. Grey: nothing recorded.</p>
      </section>

      <section>
        <h3>Each medicine</h3>
        ${r.medicines.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Each medicine"><table role="table">
          <thead role="rowgroup"><tr role="row">${["Medicine", "For", "Times", "Taken", "Missed", "Skipped", "Taken %", "Usually taken"]
            .map((h) => `<th scope="col" role="columnheader">${h}</th>`).join("")}</tr></thead>
          <tbody role="rowgroup">${rows}</tbody></table></div>` : `<p class="empty">Nothing recorded in this period.</p>`}
      </section>

      ${r.bloodReports?.length ? `<section><h3>Blood results in this period</h3>
        ${r.bloodReports.map((b) => `<p><strong>${shortDate(b.date)}</strong>${b.lab ? ` · ${esc(b.lab)}` : ""}${b.doctorSeen ? " · seen by the doctor" : ""}</p>
        <ul class="plain">${b.results.map((x) => `<li>${esc(x.testName)}: <strong>${num(x.value)} ${esc(x.unit)}</strong>${x.range ? ` (printed range ${esc(x.range)})` : ""}${x.flag === "high" || x.flag === "low" ? ` · <span class="flag-outside">${FLAG_WORDS[x.flag].toLowerCase()}</span>` : ""}</li>`).join("")}</ul>`).join("")}
      </section>` : ""}

      ${r.bpReadings?.length ? `<section><h3>Blood pressure readings</h3>
        <ul class="plain">${r.bpReadings.map((b) => `<li>${elderMoment(b.takenAt, elder.timezone)}: <strong>${b.systolic}/${b.diastolic}</strong>${b.pulse ? `, pulse ${b.pulse}` : ""}${b.aboveTarget ? ` · <span class="flag-outside">above the target</span>` : ""}</li>`).join("")}</ul>
        ${r.bpTarget ? `<p class="hint">Target given by the doctor: ${r.bpTarget.systolic}/${r.bpTarget.diastolic ?? "–"}.</p>` : ""}
      </section>` : ""}

      ${r.questions?.length ? `<section><h3>Questions to ask</h3>
        <ol class="plain">${r.questions.map((q) => `<li>${esc(q.text)}</li>`).join("")}</ol>
      </section>` : ""}

      ${r.weightReadings?.length ? `<section><h3>Weight</h3>
        <ul class="plain">${r.weightReadings.map((x) => `<li>${elderMoment(x.takenAt, elder.timezone)}: <strong>${num(x.value)} kg</strong></li>`).join("")}</ul>
      </section>` : ""}

      ${r.sugarReadings?.length ? `<section><h3>Blood sugar at home</h3>
        <ul class="plain">${r.sugarReadings.map((x) => `<li>${elderMoment(x.takenAt, elder.timezone)}: <strong>${num(x.value)} mg/dL</strong> (${{ fasting: "fasting", "after-meal": "after a meal", random: "random" }[x.context]})</li>`).join("")}</ul>
      </section>` : ""}

      ${r.testsDue?.length ? `<section><h3>Tests the doctor asked to repeat</h3>
        <ul class="plain">${r.testsDue.map((t) => `<li>${esc(t.test)}: every ${t.every} month${t.every === 1 ? "" : "s"}, ${t.status === "overdue" ? "overdue since" : "next due by"} ${shortDate(t.nextDue)}</li>`).join("")}</ul>
      </section>` : ""}

      <section>
        <h3>Medicines now</h3>
        <ul class="plain">${r.currentMedicines.map((m) => `<li><strong>${esc(m.name)} ${esc(m.strength)}</strong>${m.purpose ? ` · for ${esc(m.purpose)}` : ""} · ${m.times.map(friendlyTime).join(", ")}${m.instruction ? ` · ${esc(m.instruction)}` : ""}</li>`).join("") || "<li>None</li>"}</ul>
      </section>

      ${r.changes.length ? `<section><h3>Medicine changes in this period</h3>
        <ul class="plain">${r.changes.map((c) => `<li>${elderMoment(c.at, elder.timezone)} · ${esc(c.who ?? "")}: ${esc(c.summary)}${c.reason ? ` (${esc(c.reason)})` : ""}</li>`).join("")}</ul></section>` : ""}

      ${r.emergencies.length ? `<section><h3>Emergency button</h3>
        <ul class="plain">${r.emergencies.map((e) => `<li>Pressed ${elderMoment(e.at, elder.timezone)}${e.cancelledAt ? `; "I'm OK" at ${elderMoment(e.cancelledAt, elder.timezone)}` : ""}</li>`).join("")}</ul></section>` : ""}

      ${r.prescriptions.length ? `<section><h3>Prescriptions on file</h3>
        <ul class="plain">${r.prescriptions.map((p) => `<li>${esc(p.doctor || "Prescription")}${p.issuedOn ? `, ${shortDate(p.issuedOn)}` : ""}</li>`).join("")}</ul></section>` : ""}

      <p class="hint">${esc(r.note)} This report shows what was recorded; it is not medical advice.</p>
    </article>`);

  document.getElementById("period").addEventListener("change", (e) => showReport(elderId, Number(e.target.value)).catch(showError));
  document.getElementById("print").addEventListener("click", () => window.print());
  document.getElementById("csv").addEventListener("click", async () => {
    try {
      const file = await api("GET", `/api/elders/${elderId}/report?from=${from}&to=${to}&format=csv`, undefined, { blob: true });
      const link = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(file), download: `GoldenDose-${elder.name.replace(/[^A-Za-z0-9]+/g, "-")}-${from}-to-${to}.csv`,
      });
      link.click();
    } catch (e) { showError(e); }
  });
}

// ================================================================
// 13. Change history, approvals, and the medicine list on a past date
// ================================================================
async function showChanges(elderId) {
  const elder = await loadElder(elderId);
  const [changes, waiting] = await Promise.all([
    api("GET", `/api/elders/${elderId}/changes?limit=200`),
    api("GET", `/api/elders/${elderId}/pending-changes`),
  ]);
  const today = localParts(new Date(), elder.timezone).date;
  const isOwner = elder.role === "owner";

  const waitingList = waiting.map((w) => `
    <li class="card waiting">
      <span class="card-body">
        <span class="card-title">${esc(w.requestedBy)} wants to ${esc(w.summary)}</span>
        ${w.reason ? `<span class="card-meta">Why: ${esc(w.reason)}</span>` : ""}
        ${w.photoUrl ? `<img src="${esc(w.photoUrl)}" alt="The new photo ${esc(w.requestedBy)} wants to use" width="96" height="96" class="pill-img">` : ""}
        <span class="card-meta">Asked ${elderMoment(w.requestedAt, elder.timezone)}</span>
        ${isOwner ? `<span class="actions">
          <button class="btn btn-primary btn-small" type="button" data-approve="${w.id}">Approve</button>
          <button class="btn btn-small" type="button" data-reject="${w.id}">Reject</button></span>` : `<span class="card-meta">Waiting for the main caregiver.</span>`}
      </span>
    </li>`).join("");

  const historyList = changes.map((c) => `
    <li class="history-row">
      <span class="history-when">${elderMoment(c.at, elder.timezone)}</span>
      <span><strong>${esc(c.who ?? "Someone")}</strong>: ${esc(c.summary)}${c.reason ? `<br><span class="hint">Why: ${esc(c.reason)}</span>` : ""}</span>
    </li>`).join("");

  show(`${elder.name}: change history`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Change history</h1>
      <p class="lede">Every change to ${esc(elder.name)}'s medicines and settings: who made it, when, and why.</p>
    </section>

    ${waiting.length ? `<section><h2>${isOwner ? "Waiting for your OK" : "Waiting for approval"}</h2>
      <ul class="list">${waitingList}</ul><p class="form-error" role="alert" id="decide-error"></p></section>` : ""}

    <section>
      <h2>Medicine list on a past date</h2>
      <form id="on-date" class="inline-form" novalidate>
        <div class="field"><label for="list-date">Date</label><input type="date" id="list-date" max="${today}" value="${today}"></div>
        <button class="btn" type="submit">Show</button>
      </form>
      <div id="on-date-result" aria-live="polite"></div>
    </section>

    <section>
      <h2>All changes</h2>
      ${changes.length ? `<ul class="list history">${historyList}</ul>` : `<p class="empty">No changes recorded yet.</p>`}
    </section>`);

  view.querySelectorAll("[data-approve], [data-reject]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.approve ?? button.dataset.reject;
    button.disabled = true;
    try {
      await api("POST", `/api/pending-changes/${id}/${button.dataset.approve ? "approve" : "reject"}`);
      await showChanges(elderId);
    } catch (e) {
      if (e.status === 401) return showError(e);
      document.getElementById("decide-error").textContent = e.message;
      button.disabled = false;
    }
  }));

  const showListOn = async (date) => {
    const box = document.getElementById("on-date-result");
    try {
      const r = await api("GET", `/api/elders/${elderId}/medicines-on?date=${date}`);
      box.innerHTML = r.medicines.length ? `<div class="panel">${r.medicines.map((m) => `
        <div class="dose-row"><span class="dose-time">${m.times.map(friendlyTime).join("<br>")}</span>
          <span class="dose-name"><strong>${esc(m.name)}</strong> <span class="card-meta">${esc(m.strength)}</span>${m.purpose ? `<br><span class="card-meta">For: ${esc(m.purpose)}</span>` : ""}</span>
          ${m.approximate ? `<span class="chip chip-upcoming" title="Added before the change history began">About</span>` : ""}</div>`).join("")}</div>
        ${r.medicines.some((m) => m.approximate) ? `<p class="hint">"About": added before GoldenDose kept a change history, so details may differ.</p>` : ""}`
        : `<p class="empty">No medicines on ${shortDate(date)}.</p>`;
    } catch (e) { box.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
  };
  document.getElementById("on-date").addEventListener("submit", (e) => { e.preventDefault(); showListOn(document.getElementById("list-date").value); });
}

// ================================================================
// 14. Setup check
// ================================================================
async function showCheckup(elderId) {
  const elder = await loadElder(elderId);
  const c = await api("GET", `/api/elders/${elderId}/checkup`);
  show(`${elder.name}: setup check`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Setup check</h1>
      <p class="lede">${c.done === c.total ? "Everything is set up. Well done." : `${c.done} of ${c.total} done. Finish the rest to get the most from GoldenDose.`}</p>
      <div class="progress-track" aria-hidden="true"><span style="width:${Math.round((100 * c.done) / c.total)}%"></span></div>
    </section>
    <ul class="list">${c.items.map((i) => `
      <li><${i.ok ? "div" : `a href="${esc(i.link)}"`} class="card check-item ${i.ok ? "is-done" : ""}">
        <span class="check-mark" aria-hidden="true">${i.ok ? "✓" : ""}</span>
        <span class="card-body"><span class="card-title">${esc(i.label)}<span class="sr-only">: ${i.ok ? "done" : "not done"}</span></span>
          ${i.ok ? "" : `<span class="card-meta">${esc(i.fix)}</span>`}</span>
        ${i.ok ? "" : `<span class="chevron" aria-hidden="true">›</span>`}
      </${i.ok ? "div" : "a"}></li>`).join("")}
    </ul>`);
}

// ================================================================
// 15. Ask GoldenDose: questions in plain words, on every page about one person
// ================================================================
const askButton = Object.assign(document.createElement("button"), { type: "button", className: "ask-button", hidden: true });
askButton.innerHTML = `<span aria-hidden="true">?</span> Ask`;
const askDialog = document.createElement("dialog");
askDialog.className = "ask-dialog";
askDialog.setAttribute("aria-labelledby", "ask-title");
document.body.append(askButton, askDialog);
let askElderId = null;

// The conversation is kept for this browser tab only (one per person), and cleared with "New chat".
const chatKey = (id) => `goldendose.ask.${id}`;
const loadChat = (id) => { try { return JSON.parse(sessionStorage.getItem(chatKey(id))) ?? []; } catch { return []; } };
const saveChat = (id, chat) => { try { sessionStorage.setItem(chatKey(id), JSON.stringify(chat.slice(-20))); } catch { /* fine */ } };

function askFor(elderId) {
  askElderId = elderId;
  askButton.hidden = !elderId || !getToken();
  if (!elderId && askDialog.open) askDialog.close();
}

askButton.addEventListener("click", async () => {
  const elderId = askElderId;
  let elder;
  try { elder = await loadElder(elderId); } catch (e) { return showError(e); }
  const chat = loadChat(elderId);
  const ideas = [`How did ${elder.name} do this week?`, "What is each medicine for?", "Is anything running low?", "When is the next dose?"];

  askDialog.innerHTML = `
    <div class="ask-head">
      <h2 id="ask-title">Ask about ${esc(elder.name)}</h2>
      <button class="link-button" type="button" id="ask-close">Close</button>
    </div>
    <p class="hint">Answers come from ${esc(elder.name)}'s records in GoldenDose. Not medical advice: for anything about doses or symptoms, ask the doctor.</p>
    <div class="ask-log" id="ask-log" aria-live="polite"></div>
    <div class="ask-ideas" id="ask-ideas">${ideas.map((q) => `<button class="btn btn-small" type="button">${esc(q)}</button>`).join("")}</div>
    <form id="ask-form" class="ask-form" novalidate>
      <label class="sr-only" for="ask-input">Your question</label>
      <input type="text" id="ask-input" maxlength="500" placeholder="Type a question, in any language" autocomplete="off">
      <button class="btn btn-primary" type="submit">Send</button>
    </form>
    <button class="link-button" type="button" id="ask-new">New chat</button>`;

  const log = document.getElementById("ask-log");
  const render = () => {
    log.innerHTML = chat.map((m) => `<p class="ask-msg ask-${m.role}">${esc(m.text)}${m.note ? `<span class="hint">${esc(m.note)}</span>` : ""}</p>`).join("");
    log.scrollTop = log.scrollHeight;
    document.getElementById("ask-ideas").hidden = chat.length > 0;
  };
  render();

  const send = async (question) => {
    if (!question.trim()) return;
    const history = chat.map(({ role, text }) => ({ role, text }));
    chat.push({ role: "user", text: question.trim() });
    render();
    log.insertAdjacentHTML("beforeend", `<p class="ask-msg ask-assistant ask-thinking">Looking at the records…</p>`);
    const form = document.getElementById("ask-form");
    form.querySelector("button").disabled = true;
    try {
      const reply = await api("POST", `/api/elders/${elderId}/ask`, { question: question.trim(), history });
      chat.push({ role: "assistant", text: reply.answer, note: reply.note ?? undefined });
    } catch (e) {
      chat.push({ role: "assistant", text: e.message });
    } finally {
      form.querySelector("button").disabled = false;
    }
    saveChat(elderId, chat);
    render();
  };

  document.getElementById("ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("ask-input");
    const q = input.value;
    input.value = "";
    send(q);
  });
  document.getElementById("ask-ideas").addEventListener("click", (e) => { if (e.target.matches("button")) send(e.target.textContent); });
  document.getElementById("ask-close").addEventListener("click", () => askDialog.close());
  document.getElementById("ask-new").addEventListener("click", () => { chat.length = 0; saveChat(elderId, chat); render(); });
  askDialog.showModal();
  document.getElementById("ask-input").focus();
});

// ================================================================
// 16. First-time setup for a new person, step by step
// ================================================================
async function showSetup(elderId) {
  const elder = await loadElder(elderId);
  const [medicines, checkup] = await Promise.all([
    api("GET", `/api/elders/${elderId}/medicines`),
    api("GET", `/api/elders/${elderId}/checkup`),
  ]);
  const hasMedicine = medicines.length > 0;
  const connected = checkup.items.find((i) => i.key === "phone")?.ok;
  const a = elder.myAlerts;
  const alerts = [a.sms && "SMS", a.whatsapp && "WhatsApp", a.app && "app notification"].filter(Boolean);
  const done = 1 + Number(hasMedicine) + Number(connected);
  const step = (n, state, title, body) => `
    <li class="setup-step is-${state}">
      <span class="setup-number" aria-hidden="true">${state === "done" ? "✓" : n}</span>
      <div class="setup-body">
        <h2>${title}${state === "done" ? `<span class="sr-only"> (done)</span>` : ""}</h2>
        ${body}
      </div>
    </li>`;

  show(`Set up ${elder.name}`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Set up ${esc(elder.name)}</h1>
      <p class="lede">Four short steps. You can stop at any time and come back from ${esc(elder.name)}'s page.</p>
      <div class="progress-track" aria-hidden="true"><span style="width:${(done / 4) * 100}%"></span></div>
      <p class="hint">${done} of 4 done</p>
    </section>

    <ol class="setup-steps">
      ${step(1, "done", `${esc(elder.name)} is added`, `<p class="card-meta">You look after ${esc(elder.name)} now. You can invite brothers, sisters or a neighbour later.</p>`)}

      ${step(2, hasMedicine ? "done" : "now", hasMedicine ? `${medicines.length} medicine${medicines.length === 1 ? "" : "s"} added` : "Add the first medicine", hasMedicine
        ? `<p class="card-meta">${medicines.map((m) => esc(m.name)).join(", ")}. <a href="#/elder/${elderId}/add/setup">Add another</a></p>`
        : `<p>Keep the medicine strip or the prescription next to you. You'll type:</p>
           <ul class="plain">
             <li>the <strong>name</strong> and <strong>strength</strong>, as on the strip (for example Metformin, 500 mg)</li>
             <li>a short <strong>instruction</strong> ${esc(elder.name)} will hear, with the colour (take one white tablet after food)</li>
             <li><strong>what it's for</strong>, as the doctor said</li>
             <li>the <strong>time</strong> or times each day, and a <strong>photo</strong> of the pill if you can</li>
           </ul>
           <a class="btn btn-primary" href="#/elder/${elderId}/add/setup">Add a medicine</a>`)}

      ${step(3, connected ? "done" : hasMedicine ? "now" : "later", connected ? `${esc(elder.name)}'s phone is connected` : `Connect ${esc(elder.name)}'s phone`, connected
        ? `<p class="phone-ok">✓ Connected${checkup.lastSeen ? `. Last used ${timeAgo(checkup.lastSeen)}` : ""}. Reminders will ring on it.</p>`
        : `<p>Have ${esc(elder.name)}'s phone or tablet with you, switched on and on Wi-Fi. You'll get a code to type on it, once.</p>
           <div class="actions"><button class="btn ${hasMedicine ? "btn-primary" : ""}" type="button" id="setup-code">Get a connection code</button></div>
           <div class="code-box" id="setup-code-box" hidden aria-live="polite"></div>`)}

      ${step(4, connected ? "now" : "later", "Choose how you're told", `
        <p>If ${esc(elder.name)} doesn't tap Taken within 30 minutes, you get a message by ${alerts.length ? `<strong>${alerts.join(", ")}</strong>` : "<strong>nothing yet: all alerts are off</strong>"}.</p>
        <div class="actions">
          <a class="btn" href="#/elder/${elderId}/settings">Change how I'm told</a>
          <a class="btn ${connected ? "btn-primary" : ""}" href="#/elder/${elderId}">${connected && hasMedicine ? "Finish" : `Go to ${esc(elder.name)}'s page`}</a>
        </div>`)}
    </ol>`);

  // While the phone isn't connected, keep checking: the page turns to "Connected" by itself.
  if (!connected) watchPhone(elderId, () => showSetup(elderId).catch(showError));

  document.getElementById("setup-code")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const box = document.getElementById("setup-code-box");
    button.disabled = true;
    try {
      const { code, expiresAt } = await api("POST", `/api/elders/${elderId}/pairing-code`);
      box.innerHTML = await connectionStepsHTML(elder, code, expiresAt);
      box.hidden = false;
      button.textContent = "Get a new code";
    } catch (error) {
      if (error.status === 401) return showError(error);
      box.innerHTML = `<p class="form-error">${esc(error.message)}</p>`;
      box.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}

// ================================================================
// 17. Health records: blood reports, tests due, blood pressure, the next doctor visit
// ================================================================
// GoldenDose doesn't interpret results. "Outside the range" always means the range printed on that report.
const FLAG_WORDS = { high: "Above the printed range", low: "Below the printed range", "in range": "Within the printed range" };
const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

async function showHealth(elderId) {
  const elder = await loadElder(elderId);
  const [h, attention] = await Promise.all([
    api("GET", `/api/elders/${elderId}/health-summary`),
    api("GET", `/api/elders/${elderId}/attention`),
  ]);
  const reminders = attention.filter((a) => a.kind === "health");
  const localDateTime = (iso) => elderMoment(iso, elder.timezone);
  const me = await api("GET", "/api/me");
  const bp = h.bp;
  const openQuestions = h.questions.filter((q) => !q.answeredAt);
  const answered = h.questions.filter((q) => q.answeredAt).slice(0, 5);
  const dueTests = h.tests.filter((t) => t.dueStatus === "overdue" || t.dueStatus === "due soon");
  const bookTests = dueTests.length ? dueTests : h.tests.filter((t) => t.repeatMonths);
  const bookLink = h.lab?.phone && bookTests.length ? `https://wa.me/${h.lab.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Namaste${h.lab.name ? ` ${h.lab.name}` : ""}, please arrange a home sample collection for ${elder.name}:\n` +
    bookTests.map((t) => `- ${t.testName}`).join("\n") + `\nPlease tell me a suitable day and time. Thank you, ${me.name.split(" ")[0]}`)}` : null;
  const everyOptions = (current, choices) => choices.map(([v, label]) => `<option value="${v}" ${String(current ?? "") === String(v) ? "selected" : ""}>${label}</option>`).join("");
  const SUGAR_WHEN = { fasting: "fasting", "after-meal": "after a meal", random: "random" };
  const readingList = (list, show) => list.length > 1 ? `<details><summary>All readings (${list.length})</summary><ul class="list history">${list.map((x) => `
    <li class="history-row"><span class="history-when">${localDateTime(x.takenAt)}</span>
      <span>${show(x)}${x.recordedBy ? ` · by ${esc(x.recordedBy)}` : ""} <button class="link-button" type="button" data-remove-reading="${x.id}">Remove</button></span></li>`).join("")}</ul></details>` : "";
  const latestBp = bp.readings[0];
  const reportCards = h.reports.map((r) => `
    <li class="card lab-report" data-id="${r.id}">
      <span class="card-body">
        <span class="card-title">${shortDate(r.reportDate)}${r.lab ? ` · ${esc(r.lab)}` : ""}</span>
        <span class="card-meta">${r.results.length} result${r.results.length === 1 ? "" : "s"}${r.outsideRange ? ` · <strong class="flag-outside">${r.outsideRange} outside the printed range</strong>` : ""}
          · ${r.doctorSeenAt ? `✓ Doctor has seen it` : "Not yet shown to the doctor"}</span>
        ${r.results.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Results from ${shortDate(r.reportDate)}"><table class="lab-table">
          <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Printed range</th><th scope="col">Compared with the range</th></tr></thead>
          <tbody>${r.results.map((x) => `<tr class="${x.flag === "high" || x.flag === "low" ? "is-outside" : ""}">
            <th scope="row">${esc(x.testName)}</th><td>${num(x.value)} ${esc(x.unit)}</td><td>${esc(x.range) || "–"}</td>
            <td>${x.flag ? FLAG_WORDS[x.flag] : "No range printed"}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${r.note ? `<span class="card-meta">${esc(r.note)}</span>` : ""}
        <span class="actions">
          ${r.doctorSeenAt ? "" : `<button class="btn btn-small btn-primary" type="button" data-seen="${r.id}">Doctor has seen it</button>`}
          <a class="btn btn-small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(
            `${elder.name}'s blood report, ${shortDate(r.reportDate)}${r.lab ? ` (${r.lab})` : ""}:\n` +
            r.results.map((x) => `- ${x.testName}: ${num(x.value)} ${x.unit}${x.range ? ` (printed range ${x.range})` : ""}${x.flag === "high" || x.flag === "low" ? " *outside range*" : ""}`).join("\n") +
            "\nShared from GoldenDose. Please advise.")}">Share with the doctor</a>
          ${r.hasFile ? `<button class="btn btn-small" type="button" data-open-lab="${r.id}">Open the report</button>` : ""}
          <button class="btn btn-small" type="button" data-remove-lab="${r.id}">Remove</button>
        </span>
      </span>
    </li>`).join("");

  const testRows = h.tests.map((t) => `
    <li class="test-row">
      <span class="card-body">
        <span class="card-title">${esc(t.testName)}</span>
        <span class="card-meta">${t.latest ? `Latest: <strong>${num(t.latest.value)} ${esc(t.unit)}</strong> on ${shortDate(t.latest.date)}${t.latest.flag === "high" || t.latest.flag === "low" ? ` · <span class="flag-outside">${FLAG_WORDS[t.latest.flag].toLowerCase()}</span>` : ""}` : "No result yet"}
          ${t.trend ? ` · ${t.trend === "up" ? "↑ higher" : "↓ lower"} in each of the last 3 reports` : ""}</span>
        ${t.series.length > 1 ? `<span class="card-meta">${t.series.map((x) => `${num(x.value)} (${new Date(`${x.date}T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })})`).join(" → ")}</span>` : ""}
        <label class="repeat">Repeat, as the doctor said:
          <select data-repeat="${esc(t.testKey)}" data-name="${esc(t.testName)}">
            ${[["", "Not set"], [1, "Every month"], [3, "Every 3 months"], [6, "Every 6 months"], [12, "Every year"]]
              .map(([v, label]) => `<option value="${v}" ${String(t.repeatMonths ?? "") === String(v) ? "selected" : ""}>${label}</option>`).join("")}
          </select></label>
        ${t.nextDue ? `<span class="card-meta ${t.dueStatus === "overdue" ? "flag-outside" : ""}">${t.dueStatus === "overdue" ? "Overdue: was due" : "Next test due by"} <strong>${shortDate(t.nextDue)}</strong></span>` : ""}
      </span>
    </li>`).join("");

  show(`${elder.name}: health records`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}">${esc(elder.name)}</a>
      <h1>Health records</h1>
      <p class="lede">Blood reports, tests the doctor wants repeated, blood pressure and doctor visits. GoldenDose reminds you; the doctor decides.</p>
    </section>

    ${reminders.length ? `<section><h2>Reminders</h2>${attentionList(reminders)}</section>` : ""}

    <section>
      <h2>Next doctor visit</h2>
      <form id="visit-form" class="inline-form wrap" novalidate>
        <div class="field"><label for="visit-on">Date</label><input type="date" id="visit-on" value="${esc(h.nextVisit?.on ?? "")}"></div>
        <div class="field"><label for="visit-note">Doctor, or what it's for</label><input type="text" id="visit-note" value="${esc(h.nextVisit?.note ?? "")}" placeholder="Dr. Rao, sugar review"></div>
        <button class="btn" type="submit">Save</button>
        <p class="form-ok" role="status" id="visit-ok"></p><p class="form-error" role="alert"></p>
      </form>
      <p class="hint">You'll get a reminder in the week before, with the doctor visit report ready to print or share.</p>
    </section>

    <section>
      <h2>Questions for the doctor</h2>
      <p class="lede">Anyone in the family can add one, whenever it comes to mind. They print with the doctor visit report.</p>
      ${openQuestions.length ? `<ol class="questions">${openQuestions.map((q) => `
        <li><span>${esc(q.text)}${q.addedBy ? ` <span class="card-meta">· ${esc(q.addedBy)}</span>` : ""}</span>
          <span class="actions"><button class="btn btn-small" type="button" data-answer="${q.id}">Answered</button>
          <button class="link-button" type="button" data-remove-question="${q.id}">Remove</button></span>
          <form class="answer-form" data-answer-form="${q.id}" hidden novalidate>
            <div class="field"><label for="answer-${q.id}">What the doctor said (optional)</label><input type="text" id="answer-${q.id}"></div>
            <button class="btn btn-small btn-primary" type="submit">Save</button>
          </form></li>`).join("")}</ol>` : `<p class="empty">No questions yet.</p>`}
      <form id="question-form" class="inline-form" novalidate>
        <div class="field"><label for="question-text">New question</label><input type="text" id="question-text" placeholder="Can the evening tablet be taken with dinner?"></div>
        <button class="btn" type="submit">Add</button>
        <p class="form-error" role="alert"></p>
      </form>
      ${answered.length ? `<details><summary>Answered (${answered.length})</summary><ul class="plain">${answered.map((q) => `<li>${esc(q.text)}${q.answer ? ` <strong>→ ${esc(q.answer)}</strong>` : ""}</li>`).join("")}</ul></details>` : ""}
    </section>

    <section>
      <h2>Blood pressure</h2>
      ${latestBp ? `<p class="bp-latest ${latestBp.aboveTarget ? "flag-outside" : ""}">Latest: <strong>${latestBp.systolic}/${latestBp.diastolic}</strong>${latestBp.pulse ? `, pulse ${latestBp.pulse}` : ""} · ${localDateTime(latestBp.takenAt)}${latestBp.aboveTarget ? " · above the doctor's target" : ""}</p>` : `<p class="empty">No readings yet.</p>`}
      <form id="bp-form" class="inline-form wrap" novalidate>
        <div class="field"><label for="bp-sys">Top number</label><input type="number" id="bp-sys" inputmode="numeric" min="50" max="300" placeholder="130"></div>
        <div class="field"><label for="bp-dia">Bottom number</label><input type="number" id="bp-dia" inputmode="numeric" min="20" max="200" placeholder="80"></div>
        <div class="field"><label for="bp-pulse">Pulse (optional)</label><input type="number" id="bp-pulse" inputmode="numeric" min="20" max="250" placeholder="72"></div>
        <button class="btn btn-primary" type="submit">Save reading</button>
        <p class="form-error" role="alert"></p>
      </form>
      <details class="bp-settings" ${bp.checkEveryDays || bp.target ? "" : "open"}>
        <summary>Reminders and the doctor's target</summary>
        <form id="bp-settings" novalidate>
          ${bp.takesBpMedicine && !bp.checkEveryDays ? `<p class="hint">${esc(elder.name)} takes medicine for blood pressure. Regular checks help the doctor see how it's working.</p>` : ""}
          <div class="field"><label for="bp-every">Remind me to check blood pressure</label>
            <select id="bp-every">${[["", "Never"], [1, "Every day"], [3, "Every 3 days"], [7, "Every week"], [14, "Every 2 weeks"], [30, "Every month"]]
              .map(([v, label]) => `<option value="${v}" ${String(bp.checkEveryDays ?? "") === String(v) ? "selected" : ""}>${label}</option>`).join("")}</select></div>
          <div class="inline-form">
            <div class="field"><label for="bp-tsys">Doctor's target: top</label><input type="number" id="bp-tsys" inputmode="numeric" value="${bp.target?.systolic ?? ""}" placeholder="140"></div>
            <div class="field"><label for="bp-tdia">bottom</label><input type="number" id="bp-tdia" inputmode="numeric" value="${bp.target?.diastolic ?? ""}" placeholder="90"></div>
          </div>
          <p class="hint">Only the target ${esc(elder.name)}'s doctor gave. GoldenDose then tells you when a reading is above it.</p>
          <p class="form-ok" role="status" id="bp-settings-ok"></p><p class="form-error" role="alert"></p>
          <button class="btn" type="submit">Save</button>
        </form>
      </details>
      ${bp.readings.length > 1 ? `<details><summary>All readings (${bp.readings.length})</summary><ul class="list history">${bp.readings.map((b) => `
        <li class="history-row"><span class="history-when">${localDateTime(b.takenAt)}</span>
          <span><strong class="${b.aboveTarget ? "flag-outside" : ""}">${b.systolic}/${b.diastolic}</strong>${b.pulse ? ` · pulse ${b.pulse}` : ""}${b.recordedBy ? ` · by ${esc(b.recordedBy)}` : ""}
          <button class="link-button" type="button" data-remove-bp="${b.id}">Remove</button></span></li>`).join("")}</ul></details>` : ""}
    </section>

    <section>
      <h2>Weight</h2>
      ${h.weight.readings[0] ? `<p class="bp-latest">Latest: <strong>${num(h.weight.readings[0].value)} kg</strong> · ${localDateTime(h.weight.readings[0].takenAt)}</p>` : `<p class="empty">No readings yet.</p>`}
      <form id="weight-form" class="inline-form wrap" novalidate>
        <div class="field"><label for="weight-value">Weight (kg)</label><input type="number" step="0.1" inputmode="decimal" id="weight-value" placeholder="58.5"></div>
        <div class="field"><label for="weight-every">Remind me to weigh</label><select id="weight-every">${everyOptions(h.weight.checkEveryDays, [["", "Never"], [7, "Every week"], [14, "Every 2 weeks"], [30, "Every month"]])}</select></div>
        <button class="btn btn-primary" type="submit">Save</button>
        <p class="form-error" role="alert"></p>
      </form>
      ${readingList(h.weight.readings, (x) => `<strong>${num(x.value)} kg</strong>`)}
    </section>

    <section>
      <h2>Blood sugar at home</h2>
      ${h.sugar.takesSugarMedicine && !h.sugar.checkEveryDays ? `<p class="hint">${esc(elder.name)} takes medicine for diabetes. If the doctor wants home readings, turn on reminders below.</p>` : ""}
      ${h.sugar.readings[0] ? `<p class="bp-latest">Latest: <strong>${num(h.sugar.readings[0].value)} mg/dL</strong> (${SUGAR_WHEN[h.sugar.readings[0].context]}) · ${localDateTime(h.sugar.readings[0].takenAt)}</p>` : `<p class="empty">No readings yet.</p>`}
      <form id="sugar-form" class="inline-form wrap" novalidate>
        <div class="field"><label for="sugar-value">Sugar (mg/dL)</label><input type="number" inputmode="numeric" id="sugar-value" placeholder="120"></div>
        <div class="field"><label for="sugar-when">When</label><select id="sugar-when"><option value="fasting">Fasting</option><option value="after-meal">After a meal</option><option value="random">Random</option></select></div>
        <div class="field"><label for="sugar-every">Remind me to check sugar</label><select id="sugar-every">${everyOptions(h.sugar.checkEveryDays, [["", "Never"], [1, "Every day"], [3, "Every 3 days"], [7, "Every week"]])}</select></div>
        <button class="btn btn-primary" type="submit">Save</button>
        <p class="form-error" role="alert"></p>
      </form>
      ${readingList(h.sugar.readings, (x) => `<strong>${num(x.value)} mg/dL</strong> (${SUGAR_WHEN[x.context]})`)}
    </section>

    <section>
      <div class="section-head"><h2>Blood reports</h2><a class="btn btn-primary btn-small" href="#/elder/${elderId}/health/report">Add a blood report</a></div>
      ${h.reports.length ? `<ul class="list">${reportCards}</ul>` : `<p class="empty">No blood reports yet. Add the latest one, with the key numbers.</p>`}
    </section>

    ${h.tests.length ? `<section><h2>Each test over time</h2><ul class="list">${testRows}</ul></section>` : ""}

    <section>
      <h2>Your lab, for home sample collection</h2>
      ${bookLink ? `<a class="btn btn-primary" href="${esc(bookLink)}" target="_blank" rel="noopener">Book a home collection${dueTests.length ? ` (${dueTests.length} due)` : ""}</a>
        <p class="hint">Opens WhatsApp with a message to ${esc(h.lab.name || "your lab")} listing: ${bookTests.map((t) => esc(t.testName)).join(", ")}. Nothing is sent until you press Send.</p>`
        : `<p class="hint">${h.lab?.phone ? "Set how often the doctor wants a test repeated, and you can book it here." : "Add your lab's WhatsApp number to book home sample collections in one tap."}</p>`}
      <form id="lab-settings" class="inline-form wrap" novalidate>
        <div class="field"><label for="lab-set-name">Lab name</label><input type="text" id="lab-set-name" value="${esc(h.lab?.name ?? "")}" placeholder="City Diagnostics"></div>
        <div class="field"><label for="lab-set-phone">Lab's WhatsApp number</label><input type="tel" id="lab-set-phone" value="${esc(h.lab?.phone ?? "")}" placeholder="+91 98450 22222"></div>
        <button class="btn" type="submit">Save</button>
        <p class="form-error" role="alert"></p>
      </form>
    </section>

    <p class="hint">${esc(h.note)} If ${esc(elder.name)} feels unwell, call 108 or the doctor.</p>`);

  const reload = () => showHealth(elderId).catch(showError);
  view.onclick = async (event) => {
    const t = event.target;
    try {
      if (t.dataset.seen) { await api("POST", `/api/lab-reports/${t.dataset.seen}/doctor-seen`); return reload(); }
      if (t.dataset.removeLab) {
        if (!confirm("Remove this blood report and its results? This can't be undone.")) return;
        await api("DELETE", `/api/lab-reports/${t.dataset.removeLab}`); return reload();
      }
      if (t.dataset.removeBp) { await api("DELETE", `/api/bp/${t.dataset.removeBp}`); return reload(); }
      if (t.dataset.removeReading) { await api("DELETE", `/api/readings/${t.dataset.removeReading}`); return reload(); }
      if (t.dataset.removeQuestion) { await api("DELETE", `/api/doctor-questions/${t.dataset.removeQuestion}`); return reload(); }
      if (t.dataset.answer) {
        const form = view.querySelector(`[data-answer-form="${t.dataset.answer}"]`);
        form.hidden = false;
        form.querySelector("input").focus();
      }
      if (t.dataset.openLab) {
        const tab = window.open("", "_blank");
        const url = URL.createObjectURL(await api("GET", `/api/lab-reports/${t.dataset.openLab}/file`, undefined, { blob: true }));
        if (tab) tab.location = url; else location.href = url;
      }
    } catch (e) { showError(e); }
  };
  view.querySelectorAll("[data-repeat]").forEach((select) => select.addEventListener("change", async () => {
    try {
      await api("PUT", `/api/elders/${elderId}/test-followups`, { testKey: select.dataset.repeat, testName: select.dataset.name, repeatMonths: select.value ? Number(select.value) : null });
      reload();
    } catch (e) { showError(e); }
  }));
  const visitForm = document.getElementById("visit-form");
  visitForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(visitForm, async () => {
      const on = document.getElementById("visit-on").value;
      await api("PUT", `/api/elders/${elderId}/health-settings`, { nextVisit: on ? { on, note: document.getElementById("visit-note").value } : null });
      reload();
    });
  });
  const bpForm = document.getElementById("bp-form");
  bpForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(bpForm, async () => {
      const v = (id) => document.getElementById(id).value;
      await api("POST", `/api/elders/${elderId}/bp`, { systolic: Number(v("bp-sys")), diastolic: Number(v("bp-dia")), pulse: v("bp-pulse") ? Number(v("bp-pulse")) : null });
      reload();
    });
  });
  view.querySelectorAll("[data-answer-form]").forEach((form) => form.addEventListener("submit", (e) => {
    e.preventDefault();
    api("PUT", `/api/doctor-questions/${form.dataset.answerForm}`, { answered: true, answer: form.querySelector("input").value }).then(reload, showError);
  }));
  const questionForm = document.getElementById("question-form");
  questionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(questionForm, async () => {
      await api("POST", `/api/elders/${elderId}/doctor-questions`, { text: document.getElementById("question-text").value });
      reload();
    });
  });
  // Weight and sugar: a reading (if typed), and the reminder choice, in one Save
  for (const kind of ["weight", "sugar"]) {
    const form = document.getElementById(`${kind}-form`);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitting(form, async () => {
        const value = document.getElementById(`${kind}-value`).value;
        if (value) await api("POST", `/api/elders/${elderId}/readings`, { kind, value: Number(value), context: kind === "sugar" ? document.getElementById("sugar-when").value : undefined });
        const every = document.getElementById(`${kind}-every`).value;
        await api("PUT", `/api/elders/${elderId}/health-settings`, { [`${kind}CheckDays`]: every ? Number(every) : null });
        reload();
      });
    });
  }
  const labSettings = document.getElementById("lab-settings");
  labSettings.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(labSettings, async () => {
      await api("PUT", `/api/elders/${elderId}/health-settings`, { lab: { name: document.getElementById("lab-set-name").value, phone: document.getElementById("lab-set-phone").value } });
      reload();
    });
  });
  const settings = document.getElementById("bp-settings");
  settings.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(settings, async () => {
      const v = (id) => document.getElementById(id).value;
      await api("PUT", `/api/elders/${elderId}/health-settings`, {
        bpCheckDays: v("bp-every") ? Number(v("bp-every")) : null,
        bpTarget: v("bp-tsys") ? { systolic: Number(v("bp-tsys")), diastolic: v("bp-tdia") ? Number(v("bp-tdia")) : null } : null,
      });
      reload();
    });
  });
}

// Add a blood report: the date, the lab, a photo or PDF, and the key numbers with the range printed on the report
async function showLabReportForm(elderId) {
  const elder = await loadElder(elderId);
  const tests = await api("GET", "/api/lab-tests");
  const groups = [...new Set(tests.map((t) => t.group))];
  const options = `<option value="">Choose a test…</option>${groups.map((g) => `<optgroup label="${esc(g)}">${tests.filter((t) => t.group === g)
    .map((t) => `<option value="${t.key}">${esc(t.name)}</option>`).join("")}</optgroup>`).join("")}<option value="other">Another test…</option>`;
  const today = localParts(new Date(), elder.timezone).date;
  let rowCount = 0;
  const row = () => {
    rowCount++;
    const n = rowCount;
    return `<fieldset class="result-row" data-row="${n}">
      <legend class="sr-only">Result ${n}</legend>
      <div class="field"><label for="test-${n}">Test</label><select id="test-${n}" data-test>${options}</select></div>
      <div class="field" data-other hidden><label for="other-${n}">Test name</label><input type="text" id="other-${n}" placeholder="Ferritin"></div>
      <div class="inline-form wrap">
        <div class="field"><label for="value-${n}">Result</label><input type="number" step="any" inputmode="decimal" id="value-${n}"></div>
        <div class="field"><label for="unit-${n}">Unit</label><input type="text" id="unit-${n}"></div>
        <div class="field"><label for="low-${n}">Range on the report: from</label><input type="number" step="any" inputmode="decimal" id="low-${n}"></div>
        <div class="field"><label for="high-${n}">to</label><input type="number" step="any" inputmode="decimal" id="high-${n}"></div>
      </div>
      <button class="link-button" type="button" data-remove-row="${n}">Remove this result</button>
    </fieldset>`;
  };

  show(`${elder.name}: add a blood report`, `
    <section class="page-head">
      <a class="back" href="#/elder/${elderId}/health">Health records</a>
      <h1>Add a blood report</h1>
      <p class="lede">Type only the numbers that matter, with the <strong>range printed on the report</strong> next to each one. GoldenDose compares them with that range, never with its own.</p>
    </section>
    <form id="lab-form" novalidate>
      <div class="inline-form wrap">
        <div class="field"><label for="lab-date">Date on the report</label><input type="date" id="lab-date" max="${today}" value="${today}"></div>
        <div class="field"><label for="lab-name">Lab</label><input type="text" id="lab-name" placeholder="City Diagnostics"></div>
      </div>
      <div class="field"><label for="lab-file">Photo or PDF of the report (optional)</label>
        <input type="file" id="lab-file" accept="image/*,application/pdf"></div>
      <h2>Results</h2>
      <div id="rows">${row()}</div>
      <button class="btn btn-small" type="button" id="add-row">Add another result</button>
      <div class="field"><label for="lab-note">Note (optional)</label><input type="text" id="lab-note" placeholder="Fasting sample, taken at home"></div>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-wide" type="submit">Save report</button>
    </form>`);

  const rows = document.getElementById("rows");
  document.getElementById("add-row").addEventListener("click", () => rows.insertAdjacentHTML("beforeend", row()));
  rows.addEventListener("change", (e) => {
    if (!e.target.matches("[data-test]")) return;
    const fs = e.target.closest(".result-row");
    const known = tests.find((t) => t.key === e.target.value);
    fs.querySelector("[data-other]").hidden = e.target.value !== "other";
    const unit = fs.querySelector('[id^="unit-"]');
    if (known) unit.value = known.unit;
  });
  rows.addEventListener("click", (e) => {
    if (e.target.dataset.removeRow && rows.children.length > 1) e.target.closest(".result-row").remove();
  });
  const form = document.getElementById("lab-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const results = [...rows.querySelectorAll(".result-row")].map((fs) => {
        const q = (sel) => fs.querySelector(sel).value.trim();
        const key = q("[data-test]");
        if (!key && !q('[id^="value-"]')) return null; // an empty row
        return {
          ...(key === "other" ? { testName: q('[id^="other-"]') } : { testKey: key || undefined, testName: key ? undefined : "" }),
          value: q('[id^="value-"]'), unit: q('[id^="unit-"]'), rangeLow: q('[id^="low-"]'), rangeHigh: q('[id^="high-"]'),
        };
      }).filter(Boolean);
      const saved = await api("POST", `/api/elders/${elderId}/lab-reports`, {
        reportDate: document.getElementById("lab-date").value, lab: document.getElementById("lab-name").value,
        note: document.getElementById("lab-note").value, results,
      });
      const file = document.getElementById("lab-file").files[0];
      if (file) {
        const body = file.type === "application/pdf" ? file : await shrinkPhoto(file, 2000);
        await api("POST", `/api/lab-reports/${saved.id}/file`, undefined, { raw: body });
      }
      go(`#/elder/${elderId}/health`);
    });
  });
}

// Everything is ready: show the first screen.
route();
