// The stage for filming the apps live: a heading on the left, one phone on the right, showing the real
// family app or Kamala's app. Chrome sends a picture every time the screen changes, and each scene lasts
// as long as Bella's words for it. Used by the films in films/.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE, sleep, useDemoClock } from "../lib.js";
import { allLines } from "./lines.js";

const out = fileURLToPath(new URL("../../../docs/fullvideo/", import.meta.url));
const GAP = 0.8; // a short breath after each scene, like the slides
const RING = "6px solid #D93025"; // the same red as the click-by-click guide

const STAGE = (brand) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>
  html, body { margin: 0; height: 100%; }
  body { color: #141414; font-family: "Atkinson Hyperlegible", Verdana, sans-serif;
         display: grid; grid-template-columns: 1fr 414px; gap: 80px; align-items: center; padding: 0 150px 0 160px;
         position: relative; overflow: hidden; background: linear-gradient(135deg,#F6EFE2 0%,#ECE2CF 52%,#DDE8D7 100%); }
  /* The glass look, like the slides */
  body::before, body::after { content: ""; position: absolute; border-radius: 50%; z-index: 0; }
  body::before { width: 760px; height: 760px; top: -240px; right: -160px; background: radial-gradient(circle, rgba(19,120,64,0.40) 0%, rgba(0,0,0,0) 70%); }
  body::after { width: 640px; height: 640px; bottom: -260px; left: -160px; background: radial-gradient(circle, rgba(214,168,96,0.58) 0%, rgba(0,0,0,0) 70%); }
  .heading { position: relative; z-index: 1; padding: 48px 56px; border-radius: 40px;
             background: linear-gradient(145deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.40) 46%, rgba(255,255,255,0.22) 100%); backdrop-filter: blur(28px) saturate(170%); border: 1.5px solid rgba(255,255,255,0.88);
             box-shadow: inset 0 2px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.40), 0 30px 80px rgba(70,56,30,0.20); }
  .brand { font-size: 27px; font-weight: 700; color: #0B5A2F; margin-bottom: 18px; }
  .who { font-size: 24px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #45453F; margin-bottom: 24px; }
  h1 { font-size: 77px; line-height: 1.1; margin: 0; }
  /* The phone shows the apps at their real size (390 pixels wide), as on a phone. */
  .phone { position: relative; z-index: 1; width: 414px; height: 883px; border: 12px solid #141414; border-radius: 52px; overflow: hidden;
           background: #F6F5F0; box-shadow: 0 32px 64px rgba(0,0,0,.18); justify-self: center; box-sizing: border-box; }
  iframe { position: absolute; top: 0; left: 0; width: 390px; height: 859px; border: 0; }
  iframe.away { visibility: hidden; }
</style></head><body>
<div class="heading"><div class="brand">${brand}</div><div class="who" id="who"></div><h1 id="title"></h1></div>
<div class="phone"><iframe id="family" src="${BASE}/care/"></iframe><iframe id="elder" class="away" src="${BASE}/"></iframe></div>
</body></html>`;

export async function openStage(film, brand) {
  const liveDir = `${out}live/${film}/`;
  const lengths = JSON.parse(readFileSync(`${out}voice/lengths.json`, "utf8"));
  const soundLengths = JSON.parse(readFileSync(`${out}sounds/lengths.json`, "utf8"));

  const browser = await chromium.launch({ args: ["--hide-scrollbars"] }); // phones have no scrollbars
  const context = await browser.newContext({
    viewport: { width: 1706, height: 960 }, deviceScaleFactor: 1.125, locale: "en-IN", timezoneId: "Asia/Kolkata", // 1920×1080 pictures
  });
  await useDemoClock(context);
  const page = await context.newPage();
  await page.setContent(STAGE(brand), { waitUntil: "networkidle" });

  // ---------- Pointing, tapping and typing, with a red ring on whatever is touched ----------
  async function point(locator, ms = 800) {
    await locator.scrollIntoViewIfNeeded();
    await locator.evaluate((el, ring) => { el.style.outline = ring; el.style.outlineOffset = "4px"; }, RING);
    await sleep(ms);
  }
  async function unpoint(locator) {
    await locator.evaluate((el) => { el.style.outline = ""; }).catch(() => {});
  }
  async function tap(locator, ms = 800) {
    await point(locator, ms);
    const element = await locator.elementHandle();
    await locator.click();
    await element.evaluate((el) => { el.style.outline = ""; }).catch(() => {});
  }
  async function type(locator, text) {
    await point(locator, 300);
    await locator.pressSequentially(text, { delay: 55 });
    await unpoint(locator);
  }

  // ---------- Filming ----------
  rmSync(liveDir, { recursive: true, force: true });
  mkdirSync(`${liveDir}frames`, { recursive: true });
  const frames = [];
  const scenes = [];
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = `frames/${String(frames.length).padStart(6, "0")}.jpg`;
    writeFileSync(`${liveDir}${file}`, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });

  let current;
  // Waits until only `seconds` of this scene's words are left, so a tap can land on the last word.
  async function untilWordsLeft(seconds) {
    const wait = current.voiceStart + current.length - seconds - Date.now() / 1000;
    if (wait > 0) await sleep(wait * 1000);
  }

  // The phone makes a sound (see sounds.js): it's added to the video at this moment.
  // Waits for it to finish, unless told not to.
  async function sound(name, { wait = true } = {}) {
    if (!(name in soundLengths)) throw new Error(`No sound called "${name}". Run 2b-sounds.js first.`);
    current.sounds.push({ name, t: Date.now() / 1000 });
    if (wait) await sleep(soundLengths[name] * 1000);
  }

  // Shows Priya's phone ("family") or Kamala's ("elder"), with a heading.
  async function show(phone, title = "") {
    await page.evaluate(({ title, phone }) => {
      document.getElementById("title").textContent = title;
      document.getElementById("who").textContent = phone === "family" ? "Priya's phone · family app" : "Kamala's phone";
      document.getElementById("family").classList.toggle("away", phone !== "family");
      document.getElementById("elder").classList.toggle("away", phone !== "elder");
    }, { title, phone });
  }

  // One scene: the heading changes, then `actions` play out while Bella speaks.
  // `lead`: phone sounds that play first (an alarm ringing, say), and Bella starts once they've finished.
  async function scene(id, actions, { lead = [] } = {}) {
    const line = allLines[id];
    await show(line.picture.phone, line.picture.live);
    const start = Date.now() / 1000;
    const leadSeconds = lead.reduce((sum, name) => sum + soundLengths[name] + 0.3, 0);
    current = { start, voiceStart: start + leadSeconds, length: lengths[id].seconds, sounds: [] };
    const leading = (async () => {
      for (const name of lead) { await sound(name); await sleep(300); }
    })();
    await sleep(500);
    await actions();
    await leading;
    const left = current.voiceStart + current.length + GAP - Date.now() / 1000;
    if (left > 0) await sleep(left * 1000);
    const end = Date.now() / 1000;
    scenes.push({ id, start, end, voiceAt: leadSeconds, sounds: current.sounds.map((x) => ({ name: x.name, at: x.t - start })) });
    process.stdout.write(`\rScenes filmed: ${scenes.length}`);
  }

  return {
    page, context,
    family: page.frameLocator("#family"),
    elder: page.frameLocator("#elder"),
    familyFrame: () => page.frame({ url: /\/care\// }),
    elderFrame: () => page.frames().find((f) => f.url().startsWith(`${BASE}/`) && !f.url().includes("/care/")),
    point, unpoint, tap, type, show, scene, sound, untilWordsLeft,
    // Anything before this happens off camera.
    async startFilming() {
      // GoldenDose's font comes from Google Fonts. Make sure it has arrived on the stage and in both apps,
      // or the film would show a plainer stand-in font.
      for (const target of [page, ...page.frames().filter((f) => f !== page.mainFrame())]) {
        const ok = await target.evaluate(async () => {
          await Promise.all(["400", "700"].map((w) => document.fonts.load(`${w} 20px "Atkinson Hyperlegible"`)));
          return document.fonts.check('700 20px "Atkinson Hyperlegible"');
        });
        if (!ok) throw new Error("GoldenDose's font didn't load (is the internet on?). Please run it again.");
      }
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080 });
      await sleep(500);
    },
    async finish() {
      await cdp.send("Page.stopScreencast");
      await browser.close();
      writeFileSync(`${liveDir}timeline.json`, JSON.stringify({ frames, scenes }, null, 1));
      console.log(`\nFilmed "${film}": ${scenes.length} scenes, ${frames.length} pictures.`);
    },
  };
}
