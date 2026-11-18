// Records a demo video of GoldenDose: the real app, clicked by a robot at a human pace, with captions.
// Run from the e2e folder:  node scripts/record-demo.js
// Saves:  docs/media/goldendose-demo.webm
//
// It starts its own backend (port 3100, fresh demo data), so it never touches your demo on port 3000.

import { chromium } from "@playwright/test";
import { startTestServer, setDemoClock, useDemoClock, hhmmFromNow } from "./lib.js";
import { mkdirSync, copyFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3100";
const outDir = fileURLToPath(new URL("../../docs/media/", import.meta.url));
const tmpVideos = fileURLToPath(new URL("../test-results/video-tmp/", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. Start a fresh backend ----------
setDemoClock("20:14"); // a fixed evening, so the video looks the same whenever it's made
const server = await startTestServer();

// ---------- 2. The stage: family app, Kamala's phone, and the API log side by side ----------
const STAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  * { box-sizing: border-box; } html, body { margin: 0; height: 100%; }
  body { background: #ECEBE5; font-family: "Atkinson Hyperlegible", Verdana, sans-serif; color: #141414;
         display: grid; grid-template-rows: 1fr 150px; gap: 12px; padding: 14px; }
  .panels { display: grid; grid-template-columns: 520px 344px 1fr; gap: 14px; min-height: 0; }
  .panel { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .label { font-size: 15px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #45453F; }
  iframe { flex: 1; width: 100%; border: 0; background: #F6F5F0; }
  #family { border-radius: 14px; border: 2px solid #D6D5CE; }
  #elder { border-radius: 30px; border: 10px solid #141414; }
  #log { flex: 1; background: #141414; color: #E3F2E7; border-radius: 14px; padding: 12px; overflow: hidden;
         font-family: "IBM Plex Mono", Menlo, monospace; font-size: 13px; line-height: 1.6; display: flex; flex-direction: column; justify-content: flex-end; }
  #log div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #log .ok { color: #7FD3A2; } #log .bad { color: #FFD23F; }
  .caption { background: #141414; color: #F6F5F0; border-radius: 16px; padding: 18px 26px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .caption .step { font-size: 15px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #FFD23F; }
  .caption .do { font-size: 27px; font-weight: 700; line-height: 1.2; }
  .caption .say { font-size: 19px; font-style: italic; color: #D9D8D0; line-height: 1.35; }
  #cover { position: fixed; inset: 0; background: #141414; color: #F6F5F0; display: flex; flex-direction: column; justify-content: center; padding: 90px; gap: 22px; z-index: 9; transition: opacity .6s; }
  #cover h1 { font-size: 76px; margin: 0; } #cover p { font-size: 28px; margin: 0; color: #D9D8D0; max-width: 1000px; line-height: 1.4; }
  #cover .eyebrow { font-size: 18px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #FFD23F; }
  #cover.hide { opacity: 0; pointer-events: none; }
</style></head><body>
<div id="cover"><span class="eyebrow">GoldenDose · demo walkthrough</span><h1 id="cover-title">Watch, then copy</h1><p id="cover-text"></p></div>
<div class="panels">
  <div class="panel"><span class="label">Left · Priya's family app</span><iframe id="family" src="${BASE}/care/"></iframe></div>
  <div class="panel"><span class="label">Middle · Kamala's phone</span><iframe id="elder" src="${BASE}/"></iframe></div>
  <div class="panel"><span class="label">Right · behind the scenes (API)</span><div id="log"></div></div>
</div>
<div class="caption"><span class="step" id="step"></span><span class="do" id="do"></span><span class="say" id="say"></span></div>
</body></html>`;

// Only our Calcium alarm should ring: mark demo doses due around now as taken (same as npm run demo).
{
  const call = async (method, path, token, body) => (await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })).json();
  const { token } = await call("POST", "/api/auth/login", null, { email: "priya@example.com", password: "goldendose-demo" });
  const kamala = (await call("GET", "/api/elders", token)).find((e) => e.name === "Kamala");
  const { code } = await call("POST", `/api/elders/${kamala.id}/pairing-code`, token);
  const { deviceToken } = await call("POST", "/api/devices/pair", null, { code });
  const today = await call("GET", "/api/today", deviceToken);
  const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  for (const dose of today.doses) {
    const minutesUntilDue = toMinutes(dose.time) - toMinutes(today.now);
    if (dose.status === "pending" && minutesUntilDue <= 60 && minutesUntilDue > -30) {
      await call("POST", "/api/doses", deviceToken, { scheduleId: dose.scheduleId, status: "taken" });
    }
  }
}

// Always stop the test backend, even if the recording fails part-way.
process.on("exit", () => server.kill());

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: tmpVideos, size: { width: 1024, height: 576 } },
  locale: "en-IN",
  timezoneId: "Asia/Kolkata",
});
await useDemoClock(context);
const page = await context.newPage();

// Show every API request in the right-hand panel, like the Terminal does in a real demo.
let logging = false;
page.on("response", async (response) => {
  const url = new URL(response.url());
  if (!logging || !url.pathname.startsWith("/api/")) return;
  const line = `${response.request().method().padEnd(6)} ${url.pathname}${url.search} → ${response.status()}`;
  await page.evaluate(({ line, ok }) => {
    const row = document.createElement("div");
    row.textContent = line;
    row.className = ok ? "ok" : "bad";
    document.getElementById("log").append(row);
  }, { line, ok: response.status() < 400 }).catch(() => {});
});

await page.setContent(STAGE, { waitUntil: "networkidle" });
const family = page.frameLocator("#family");
const elder = page.frameLocator("#elder");

// Chapter markers: the moment (in seconds from the start of the video) each step begins.
const videoStart = Date.now();
const chapters = [];

let lastCaptionAt = 0;
const MIN_CAPTION_MS = 8000; // every caption stays up long enough to read

async function caption(step, doText, sayText = "") {
  const shown = Date.now() - lastCaptionAt;
  if (lastCaptionAt && shown < MIN_CAPTION_MS) await sleep(MIN_CAPTION_MS - shown);
  lastCaptionAt = Date.now();
  chapters.push({ at: Math.round((Date.now() - videoStart) / 1000), step, do: doText });
  await page.evaluate(({ step, doText, sayText }) => {
    document.getElementById("step").textContent = step;
    document.getElementById("do").textContent = doText;
    document.getElementById("say").textContent = sayText ? `Say: "${sayText}"` : "";
  }, { step, doText, sayText });
}

async function cover(title, text, ms) {
  await page.evaluate(({ title, text }) => {
    document.getElementById("cover-title").textContent = title;
    document.getElementById("cover-text").textContent = text;
    document.getElementById("cover").classList.remove("hide");
  }, { title, text });
  await sleep(ms);
  await page.evaluate(() => document.getElementById("cover").classList.add("hide"));
  await sleep(700);
}

// Draw a blue ring around what's about to be clicked, so you can see where to click.
async function point(locator, ms = 1100) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el) => { el.style.outline = "5px solid #1F4FD1"; el.style.outlineOffset = "4px"; });
  await sleep(ms);
}
async function tap(locator) {
  await point(locator);
  const element = await locator.elementHandle(); // hold on to it: after the click it may disappear
  await locator.click();
  await element.evaluate((el) => { el.style.outline = ""; }).catch(() => {});
}
async function type(locator, text) {
  await point(locator, 500);
  await locator.pressSequentially(text, { delay: 70 });
  await locator.evaluate((el) => { el.style.outline = ""; }).catch(() => {});
}

// ---------- 3. The demo ----------
await cover("Watch, then copy", "Left: Priya's family app. Middle: Kamala's phone. Right: every request the screens send to the backend. Captions tell you what to do and what to say.", 6000);
logging = true;

await caption("Step 1 of 9 · Family app", "Sign in as Priya", "Priya looks after both her parents. This is her family app.");
await type(family.getByLabel("Email"), "priya@example.com");
await type(family.getByLabel("Password"), "goldendose-demo");
await tap(family.getByRole("button", { name: "Sign in" }));
await sleep(3000);

await caption("Step 2 of 9 · Family app", "Open Kamala. Point at the red Missed chips", "This morning's doses were missed, and every carer was alerted 30 minutes later, the way they chose.");
await tap(family.getByRole("link", { name: /^Kamala/ }));
await sleep(1500);
await point(family.locator(".chip-missed").first(), 3500);
await family.locator(".chip-missed").first().evaluate((el) => { el.style.outline = ""; });

await caption("Step 3 of 9 · Family app", "Add a medicine due right now (in your demo, npm run demo does this for you)", "The instruction is read aloud to Kamala, so mention the colour. A photo of the strip helps most.");
await tap(family.getByRole("link", { name: "Add a medicine" }));
await sleep(800);
const hhmm = hhmmFromNow(0);
await type(family.getByLabel("Medicine name"), "Calcium");
await type(family.getByLabel("Strength"), "500 mg");
await type(family.getByLabel("Instruction"), "Take one orange tablet with water");
await point(family.getByLabel("Time").first(), 500);
await family.getByLabel("Time").first().fill(hhmm);
await family.getByRole("radio", { name: "Oval" }).check();
await family.getByRole("radio", { name: "Orange" }).first().check();
await point(family.locator("#photo-preview"), 1500);
await tap(family.getByRole("button", { name: "Add medicine" }));
await sleep(2000);

await caption("Step 4 of 9 · Family app", "Scroll down and click Get a connection code", "Kamala never needs a password. Her daughter shows a code once, and the phone is remembered.");
await tap(family.getByRole("button", { name: "Get a connection code" }));
await sleep(1200);
const code = (await family.locator(".code").textContent()).replace(/\D/g, "");
await point(family.locator(".code"), 2500);

await caption("Step 5 of 9 · Kamala's phone", "Type the 6 digits on Kamala's phone, then Connect", "Watch the right: the phone asks the backend for today's medicines. That's the API.");
await type(elder.getByLabel("Code"), code);
await tap(elder.getByRole("button", { name: "Connect" }));
await sleep(1500);

await caption("Step 6 of 9 · The highlight", "The alarm rings. Let it ring for a few seconds", "Not a small notification: a full-screen alarm with the pill's picture, and it reads the instruction aloud. (Sound isn't recorded in this video.)");
await sleep(6500);

await caption("Step 7 of 9 · Kamala's phone", "Tap the big green Taken button", "One big button. Then a clear Well done, and a green tick with the time.");
await tap(elder.getByRole("alertdialog").getByRole("button", { name: "Taken" }));
await sleep(4500);

await caption("Step 8 of 9 · Kamala's phone", "Tap Undo, then Taken again", "If she presses by mistake, Undo for five minutes. Mistakes are cheap, so she's never afraid of the app.");
const calciumCard = elder.locator(".card", { hasText: "Calcium" });
await tap(calciumCard.getByRole("button", { name: "Undo" }));
await sleep(2500);
await tap(calciumCard.getByRole("button", { name: "Taken" }));
await sleep(3500);

await caption("Step 9 of 9 · Family app", "Reload Priya's page (Cmd + R): Calcium shows Taken", "At the same moment, her daughter can see it's done.");
await page.frame({ url: /\/care\// }).evaluate(() => location.reload());
await sleep(2000);
await point(family.locator(".dose-row", { hasText: "Calcium" }), 4000);

logging = false;
await cover("Your turn", "Start with npm run demo, then follow the Demo Runbook step by step. Afterwards, explain how it works with slides 7 to 9.", 5000);

// ---------- 4. Save the video ----------
const video = page.video();
await context.close();
await browser.close();
server.kill();

mkdirSync(outDir, { recursive: true });
const target = `${outDir}goldendose-demo.webm`;
copyFileSync(await video.path(), target);
rmSync(tmpVideos, { recursive: true, force: true });
writeFileSync(`${outDir}goldendose-demo-chapters.json`, JSON.stringify(chapters, null, 2));
console.log(`Saved ${target} (${(statSync(target).size / 1_048_576).toFixed(1)} MB)`);
