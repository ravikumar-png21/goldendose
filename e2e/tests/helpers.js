// Shortcuts the tests share. They set things up through the API (fast),
// so each test can spend its time on the screens it's really checking.
import { expect } from "@playwright/test";

export const PRIYA = { email: "priya@example.com", password: "goldendose-demo" };

export async function signInPriya(request) {
  const reply = await request.post("/api/auth/login", { data: PRIYA });
  return (await reply.json()).token;
}

// A clock time in Kamala's timezone, some minutes from now: hhmmFromNow(0) is "now", e.g. "18:59".
export function hhmmFromNow(minutes) {
  return new Date(Date.now() + minutes * 60_000).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
  });
}

// Minutes left before midnight in Kamala's timezone. Schedules are daily, so a test that needs
// a dose "later today" can't run in the last few minutes before midnight (it would land tomorrow).
export function minutesLeftToday() {
  const [h, m] = hhmmFromNow(0).split(":").map(Number);
  return 24 * 60 - (h * 60 + m);
}

// A brand-new elder for one test, so tests don't affect each other.
let counter = 0;
export async function newElder(request, token, medicines = []) {
  counter++;
  const auth = { Authorization: `Bearer ${token}` };
  const elder = await (await request.post("/api/elders", {
    headers: auth, data: { name: `Test Elder ${counter}`, timezone: "Asia/Kolkata" },
  })).json();
  for (const medicine of medicines) {
    const reply = await request.post(`/api/elders/${elder.id}/medicines`, { headers: auth, data: medicine });
    expect(reply.status()).toBe(201);
  }
  return elder;
}

export async function pairingCode(request, token, elderId) {
  const reply = await request.post(`/api/elders/${elderId}/pairing-code`, { headers: { Authorization: `Bearer ${token}` } });
  return (await reply.json()).code;
}

// Opens Kamala's app and connects it with a pairing code, the way a person would.
export async function openPairedElderApp(page, request, token, elderId) {
  const code = await pairingCode(request, token, elderId);
  await page.goto("/");
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Test Elder");
  // Tapping "Connect" already counts as the one tap browsers need for sound, so the sound bar is gone.
  await expect(page.getByRole("button", { name: /switch on the alarm sound/ })).toBeHidden();
}

// The app ignores a second tap within 0.8 seconds (wrong-tap protection), so a robot must wait like a person.
export const pause = (page) => page.waitForTimeout(900);
