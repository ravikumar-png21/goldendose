// Shared helpers for the scripts that make screenshots and videos.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const BASE = "http://localhost:3100";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- A pretend clock ----------
// Pictures and videos should look the same whatever the real time is, because the written guides
// mention the times on screen ("Taken at 8:14 pm"). setDemoClock("20:14") makes the test backend and
// the test browser both believe it's 8:14 pm today (India time); time then runs on normally from there.
// Call it before startTestServer(), and call useDemoClock(context) on every browser context.
let clockOffset = 0;
export function setDemoClock(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const nowSeconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  clockOffset = ((h * 60 + m) * 60 - nowSeconds) * 1000;
}
export const demoNow = () => Date.now() + clockOffset;
export async function useDemoClock(context) {
  if (clockOffset) await context.clock.install({ time: new Date(demoNow()) });
}

// Starts a fresh test backend (port 3100, demo data). Stopped automatically when the script ends.
// Options: { empty: true } starts with no accounts at all; { dbFile } puts the database where the script can reach it.
export async function startTestServer({ empty = false, dbFile } = {}) {
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "scripts/start-test-server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "ignore",
    env: { ...process.env, CLOCK_OFFSET_MS: String(clockOffset), // the backend runs on the same pretend clock
      ...(empty ? { EMPTY: "1" } : {}), ...(dbFile ? { TEST_DB_FILE: dbFile } : {}) },
  });
  process.on("exit", () => server.kill());
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return server; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("The test backend didn't start.");
}

export async function api(method, path, token, body, raw) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(raw ? { "Content-Type": raw.type } : body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ? raw.bytes : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function signInPriya() {
  return (await api("POST", "/api/auth/login", null, { email: "priya@example.com", password: "goldendose-demo" })).token;
}

export async function kamalaOf(token) {
  return (await api("GET", "/api/elders", token)).find((e) => e.name === "Kamala");
}

// Marks any demo dose due around now as taken, so only the alarms a script creates will ring.
export async function clearDueDoses(token, elderId) {
  const { code } = await api("POST", `/api/elders/${elderId}/pairing-code`, token);
  const { deviceToken } = await api("POST", "/api/devices/pair", null, { code });
  const today = await api("GET", "/api/today", deviceToken);
  const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  for (const dose of today.doses) {
    const minutesUntilDue = toMinutes(dose.time) - toMinutes(today.now);
    if (dose.status === "pending" && minutesUntilDue <= 60 && minutesUntilDue > -30) {
      await api("POST", "/api/doses", deviceToken, { scheduleId: dose.scheduleId, status: "taken" });
    }
  }
  await api("DELETE", "/api/devices/me", deviceToken); // a helper, not Kamala's real phone: disconnect it again
}

// A clock time in India, some minutes from now: "20:15"
export function hhmmFromNow(minutes) {
  return new Date(demoNow() + minutes * 60_000).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
  });
}
