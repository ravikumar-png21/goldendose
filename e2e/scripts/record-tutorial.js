// Records the screen-by-screen tutorial video: both phones side by side, the active one highlighted,
// and a panel explaining each screen.  Run from the e2e folder:  node scripts/record-tutorial.js
// Saves:  docs/tutorial/goldendose-tutorial.webm  and its chapter times.
import { chromium } from "@playwright/test";
import { mkdirSync, copyFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE, sleep, startTestServer, signInPriya, kamalaOf, clearDueDoses, hhmmFromNow, setDemoClock, useDemoClock } from "./lib.js";

const outDir = fileURLToPath(new URL("../../docs/tutorial/", import.meta.url));
const tmpVideos = fileURLToPath(new URL("../test-results/tutorial-tmp/", import.meta.url));

setDemoClock("20:14"); // the same evening as the written tutorial
await startTestServer();
const token = await signInPriya();
await clearDueDoses(token, (await kamalaOf(token)).id); // only the medicine we add will ring

const STAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>
  * { box-sizing: border-box; } html, body { margin: 0; height: 100%; }
  body { background: #ECEBE5; font-family: "Atkinson Hyperlegible", Verdana, sans-serif; color: #141414;
         display: grid; grid-template-columns: 372px 372px 1fr; gap: 20px; padding: 18px 22px; }
  .phone { display: flex; flex-direction: column; gap: 8px; transition: opacity .5s; min-height: 0; }
  .phone.dim { opacity: .35; }
  .label { font-size: 16px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #45453F; text-align: center; }
  iframe { flex: 1; width: 100%; border: 10px solid #141414; border-radius: 34px; background: #F6F5F0; }
  .panel { background: #141414; color: #F6F5F0; border-radius: 22px; padding: 30px 30px; display: flex; flex-direction: column; gap: 16px; }
  .part { font-size: 15px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #FFD23F; }
  .title { font-size: 34px; font-weight: 700; line-height: 1.15; margin: 0; }
  ul { margin: 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 10px; font-size: 21px; line-height: 1.4; color: #E4E3DC; }
  .why { margin-top: auto; background: #1F3A2C; color: #CFEBDA; border-radius: 14px; padding: 14px 16px; font-size: 18px; line-height: 1.4; }
  .why:empty { display: none; }
  #cover { position: fixed; inset: 0; background: #141414; color: #F6F5F0; display: flex; flex-direction: column; justify-content: center; padding: 90px; gap: 22px; z-index: 9; transition: opacity .6s; }
  #cover h1 { font-size: 72px; margin: 0; } #cover p { font-size: 28px; margin: 0; color: #D9D8D0; max-width: 1000px; line-height: 1.4; }
  #cover .eyebrow { font-size: 18px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #FFD23F; }
  #cover.hide { opacity: 0; pointer-events: none; }
</style></head><body>
<div id="cover"><span class="eyebrow">GoldenDose · app tutorial</span><h1 id="cover-title"></h1><p id="cover-text"></p></div>
<div class="phone" id="family-phone"><span class="label">Priya's phone · family app</span><iframe id="family" src="${BASE}/care/"></iframe></div>
<div class="phone dim" id="elder-phone"><span class="label">Kamala's phone</span><iframe id="elder" src="${BASE}/"></iframe></div>
<div class="panel"><span class="part" id="part"></span><h2 class="title" id="title"></h2><ul id="points"></ul><p class="why" id="why"></p></div>
</body></html>`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: tmpVideos, size: { width: 1024, height: 576 } },
  locale: "en-IN",
  timezoneId: "Asia/Kolkata",
});
await useDemoClock(context);
const page = await context.newPage();
await page.setContent(STAGE, { waitUntil: "networkidle" });
const family = page.frameLocator("#family");
const elder = page.frameLocator("#elder");
const familyFrame = () => page.frame({ url: /\/care\// });
const elderFrame = () => page.frames().find((f) => f.url().startsWith(`${BASE}/`) && !f.url().includes("/care/"));

// ---------- Helpers ----------
const videoStart = Date.now();
const chapters = [];
let lastScreenAt = 0;
const MIN_SCREEN_MS = 9000; // each explanation stays up long enough to read

async function screen(part, title, points, why = "", phone = "family") {
  const shown = Date.now() - lastScreenAt;
  if (lastScreenAt && shown < MIN_SCREEN_MS) await sleep(MIN_SCREEN_MS - shown);
  lastScreenAt = Date.now();
  chapters.push({ at: Math.round((Date.now() - videoStart) / 1000), part, title });
  await page.evaluate(({ part, title, points, why, phone }) => {
    document.getElementById("part").textContent = part;
    document.getElementById("title").textContent = title;
    const list = document.getElementById("points");
    list.replaceChildren(...points.map((p) => Object.assign(document.createElement("li"), { textContent: p })));
    document.getElementById("why").textContent = why ? `Why: ${why}` : "";
    document.getElementById("family-phone").classList.toggle("dim", phone !== "family");
    document.getElementById("elder-phone").classList.toggle("dim", phone !== "elder");
  }, { part, title, points, why, phone });
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

async function point(locator, ms = 1100) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el) => { el.style.outline = "5px solid #1F4FD1"; el.style.outlineOffset = "4px"; });
  await sleep(ms);
}
async function unpoint(locator) {
  await locator.evaluate((el) => { el.style.outline = ""; }).catch(() => {});
}
async function tap(locator) {
  await point(locator);
  const element = await locator.elementHandle();
  await locator.click();
  await element.evaluate((el) => { el.style.outline = ""; }).catch(() => {});
}
async function type(locator, text) {
  await point(locator, 400);
  await locator.pressSequentially(text, { delay: 60 });
  await unpoint(locator);
}
async function scrollTo(frame, y) {
  await frame.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);
  await sleep(1200);
}

// ---------- The tutorial ----------
await cover("Every screen, and how to use it", "Left: Priya's family app. Middle: Kamala's phone. The phone in use is bright, and the panel on the right explains each screen.", 6000);

// Part 2 first: the family sets things up
await screen("Family app", "Sign in", [
  "New? Tap Create an account: name, mobile number, email, password.",
  "Returning: email and password, then Sign in.",
  "You stay signed in on this phone.",
], "a wrong password only says \"Email or password is wrong\", so nobody can discover which emails have accounts.");
await type(family.getByLabel("Email"), "priya@example.com");
await type(family.getByLabel("Password"), "goldendose-demo");
await tap(family.getByRole("button", { name: "Sign in" }));
await sleep(1500);

await screen("Family app", "The people you look after", [
  "Everyone you care for, and your role.",
  "Tap a person to open their page.",
  "Add a person at the bottom: their name is how their app greets them.",
], "one caregiver can look after several people, like both parents.");
await sleep(2500);
await tap(family.getByRole("link", { name: /^Kamala/ }));
await sleep(1000);

await screen("Family app", "One person's page", [
  "Summary: how many doses taken, and any missed.",
  "Today: every dose with a chip. Green Taken, red Missed, yellow Due now.",
  "Below: her medicines, her phone, and alerts.",
], "Priya sees \"Missed\" because she's the one who acts.");
await scrollTo(familyFrame(), 0);
await sleep(3000);
await scrollTo(familyFrame(), 700);
await sleep(2000);

await screen("Family app", "Adding a medicine", [
  "Name and strength, then an instruction that mentions the colour: it's read aloud.",
  "Times each day: Add another time for twice a day.",
  "A photo of the strip is best. Shape and colour draw the pill otherwise.",
], "people recognise medicine by how it looks, not by its name.");
await tap(family.getByRole("link", { name: "Add a medicine" }));
await sleep(700);
const hhmm = hhmmFromNow(0);
await type(family.getByLabel("Medicine name"), "Calcium");
await type(family.getByLabel("Strength"), "500 mg");
await type(family.getByLabel("Instruction"), "Take one orange tablet with water");
await point(family.getByLabel("Time").first(), 500);
await family.getByLabel("Time").first().fill(hhmm);
await unpoint(family.getByLabel("Time").first());
await family.getByRole("radio", { name: "Oval" }).check();
await family.getByRole("radio", { name: "Orange" }).first().check();
await point(family.locator("#photo-preview"), 1800);
await unpoint(family.locator("#photo-preview"));
await tap(family.getByRole("button", { name: "Add medicine" }));
await sleep(1500);

await screen("Family app", "Connecting Kamala's phone", [
  "On her page, scroll to her phone and tap Get a connection code.",
  "Type the 6 digits on her phone, once.",
  "Each code works once, for 15 minutes.",
], "no password for the older person: one of the biggest barriers, removed.");
await tap(family.getByRole("button", { name: "Get a connection code" }));
await sleep(1000);
const code = (await family.locator(".code").textContent()).replace(/\D/g, "");
await point(family.locator(".code"), 2500);

// Part 1: Kamala's app
await screen("Kamala's app", "Welcome: typing the code", [
  "A big box for the 6 digits, and a Connect button.",
  "A short or wrong code gets a plain message, never an error number.",
  "After this, the phone is remembered.",
], "", "elder");
await type(elder.getByLabel("Code"), "123");
await tap(elder.getByRole("button", { name: "Connect" }));
await point(elder.getByRole("alert"), 2200);
await elder.getByLabel("Code").fill("");
await type(elder.getByLabel("Code"), code);
await tap(elder.getByRole("button", { name: "Connect" }));
await sleep(1500);

await screen("Kamala's app", "The alarm", [
  "The whole screen turns yellow, with the pill's picture, name and instruction.",
  "It chimes and reads the instruction aloud (no sound in this video).",
  "Unanswered, it rings again every 5 minutes; after 30 minutes the family is told.",
], "a small notification is easy to miss. This can't be.", "elder");
await sleep(4000);

await screen("Kamala's app", "Taken: Well done", [
  "One big green button. Then \"Well done\" and the time.",
  "The card turns green: \"Taken at 8:14 pm\", with an Undo button.",
  "A second tap within a second is ignored.",
], "the green tick with a time answers \"did I already take it?\"", "elder");
await tap(elder.getByRole("alertdialog").getByRole("button", { name: "Taken" }));
await sleep(4000);

await screen("Kamala's app", "Today, and the four kinds of card", [
  "White \"Due now\": tap Taken. Green: done, with Undo for 5 minutes.",
  "Cream \"Not taken yet\": late, but she can still take it.",
  "Dashed \"Later today\": no Taken button, so no mistakes.",
], "she never sees \"missed\" in red. That would worry her.", "elder");
await scrollTo(elderFrame(), 0);
await sleep(2000);
const calciumCard = elder.locator(".card", { hasText: "Calcium" });
await point(calciumCard.getByRole("button", { name: "Undo" }), 2000);
await unpoint(calciumCard.getByRole("button", { name: "Undo" }));
await scrollTo(elderFrame(), 0);
await sleep(1500);
await point(elder.getByRole("button", { name: "Read aloud" }).first(), 1500);
await unpoint(elder.getByRole("button", { name: "Read aloud" }).first());

await screen("Kamala's app", "Without internet", [
  "A cream banner: \"No internet right now. Reminders still work.\"",
  "Taps are saved on the phone and sent automatically later.",
  "Nothing different to do.",
], "a Wi-Fi drop shouldn't mean a missed pill.", "elder");
await context.setOffline(true);
await sleep(800);
await scrollTo(elderFrame(), 0);
await tap(elder.locator(".card-not-taken").first().getByRole("button", { name: "Taken" }));
await sleep(1200);
await scrollTo(elderFrame(), 0);
await sleep(3000);
await context.setOffline(false);
await sleep(1500);

// Back to the family app
await screen("Family app", "Priya sees it too", [
  "Reload her page: Calcium shows Taken, with the time.",
  "The dose tapped offline arrived too, once the internet was back.",
], "", "family");
await familyFrame().evaluate(() => location.reload());
await sleep(2000);
await point(family.locator(".dose-row", { hasText: "Calcium" }), 3000);
await unpoint(family.locator(".dose-row", { hasText: "Calcium" }));

await screen("Family app", "History: the last 7 days", [
  "Each day, newest first, with \"4 of 5 taken\".",
  "Every dose: Taken with the time, Skipped, or Missed.",
  "Useful for the doctor's \"has she been taking it?\"",
]);
await tap(family.getByRole("link", { name: "Last 7 days", exact: true }));
await sleep(1500);
await scrollTo(familyFrame(), 500);
await sleep(1500);

await screen("Family app", "Alerts and family", [
  "Tick how you're told about a missed dose: SMS, WhatsApp, app notification.",
  "Each family member chooses for themselves.",
  "Invite family by email: Helper, or Main caregiver.",
], "every carer is alerted 30 minutes after a missed dose, their way.");
await familyFrame().evaluate(() => { location.hash = location.hash.replace("/history", "/settings"); });
await sleep(1500);
await point(family.getByLabel("WhatsApp"), 1500);
await unpoint(family.getByLabel("WhatsApp"));
await scrollTo(familyFrame(), 600);
await sleep(1500);

await screen("Family app", "Changing or stopping a medicine", [
  "Tap a medicine on the person's page to change it, then Save changes.",
  "Stop this medicine asks first: Yes, stop it, or Keep it.",
  "Past records are kept.",
]);
await familyFrame().evaluate(() => { location.hash = location.hash.replace("/settings", ""); });
await sleep(1200);
await tap(family.getByRole("link", { name: /^Amlodipine/ }));
await sleep(800);
await tap(family.getByRole("button", { name: "Stop Amlodipine" }));
await point(family.getByRole("button", { name: "Keep it" }), 2000);
await tap(family.getByRole("button", { name: "Keep it" }));
await sleep(1500);

await sleep(MIN_SCREEN_MS - 4000);
await cover("That's every screen", "Read the written tutorial for the details, then try it yourself with npm run demo.", 5000);

// ---------- Save ----------
const video = page.video();
await context.close();
await browser.close();
mkdirSync(outDir, { recursive: true });
const target = `${outDir}goldendose-tutorial.webm`;
copyFileSync(await video.path(), target);
rmSync(tmpVideos, { recursive: true, force: true });
writeFileSync(`${outDir}goldendose-tutorial-chapters.json`, JSON.stringify(chapters, null, 2));
console.log(`Saved ${target} (${(statSync(target).size / 1_048_576).toFixed(1)} MB)`);
process.exit(0);
