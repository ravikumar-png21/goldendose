// Step 1: makes one 1920×1080 picture for every line in the chosen video
// (except the live scenes, which 3-film.js films instead).
//
//   node 1-make-pictures.js <video>      (video: "full" or "live", see lines.js)
//   docs/fullvideo/frames/<id>.png
//
// PDF pages come from docs/Why-GoldenDose.pdf (made by docs/why-deck/make-pdf.cjs), and click slides from the click-by-click guide
// (made by guide-video step 1 if they aren't there yet).
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chosenVideo } from "./lines.js";

const { lines } = chosenVideo();

const docs = fileURLToPath(new URL("../../../docs/", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));
const out = `${docs}fullvideo/`;
const framesDir = `${out}frames/`;
const pdfDir = `${out}pdf-pages/`;
const clickFramesDir = `${docs}clickguide/video/frames/`;

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

// PDF pages
if (lines.some((l) => l.picture.pdf)) {
  execFileSync("swift", ["-suppress-warnings", `${here}pdf-pages.swift`, `${docs}Why-GoldenDose.pdf`, pdfDir], { stdio: "inherit" });
}

// Click-by-click slides
if (lines.some((l) => l.picture.click)) {
  console.log("Making the click-by-click slide pictures…"); // always fresh: the slides may have changed
  execFileSync("node", [`${here}../guide-video/1-slides-and-script.js`], { stdio: "inherit" });
}
const clickFrames = existsSync(clickFramesDir) ? readdirSync(clickFramesDir) : [];

// Title cards are small web pages, photographed by a headless browser.
const style = `
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }
  body { color: #141414; font-family: "Atkinson Hyperlegible", Verdana, sans-serif; position: relative; overflow: hidden;
         background: linear-gradient(135deg,#F6EFE2 0%,#ECE2CF 52%,#DDE8D7 100%); }
  /* The glass look, like the slides: soft circles behind a frosted panel */
  body::before, body::after { content: ""; position: absolute; border-radius: 50%; }
  body::before { width: 820px; height: 820px; top: -260px; right: -200px; background: radial-gradient(circle, rgba(19,120,64,0.40) 0%, rgba(0,0,0,0) 70%); }
  body::after { width: 700px; height: 700px; bottom: -280px; left: -180px; background: radial-gradient(circle, rgba(214,168,96,0.58) 0%, rgba(0,0,0,0) 70%); }
  .title { position: absolute; inset: 200px 180px; display: flex; flex-direction: column; justify-content: center; padding: 0 96px; z-index: 1;
           background: linear-gradient(145deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.40) 46%, rgba(255,255,255,0.22) 100%); backdrop-filter: blur(28px) saturate(170%); border: 1.5px solid rgba(255,255,255,0.88);
           border-radius: 48px; box-shadow: inset 0 2px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.40), 0 30px 80px rgba(70,56,30,0.20); }
  .title .brand { font-size: 40px; font-weight: 700; color: #0B5A2F; margin-bottom: 40px; }
  .title h1 { font-size: 110px; line-height: 1.05; margin: 0; }
  .title p { font-size: 50px; color: #45453F; margin: 36px 0 0; }
`;
const page_ = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>${style}</style></head><body>${body}</body></html>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const tempPage = `${out}card.html`;

for (const [index, line] of lines.entries()) {
  const file = `${framesDir}${line.id}.png`;
  const p = line.picture;
  if (p.live) {
    continue; // filmed by 3-record-first-time.js
  } else if (p.pdf) {
    copyFileSync(`${pdfDir}p${String(p.pdf).padStart(2, "0")}.png`, file);
  } else if (p.click) {
    const found = clickFrames.find((name) => name.endsWith(`-${p.click}.png`));
    if (!found) throw new Error(`No click-by-click slide called "${p.click}".`);
    copyFileSync(`${clickFramesDir}${found}`, file);
  } else {
    const body = `<div class="title"><div class="brand">GoldenDose</div><h1>${esc(p.title)}</h1>${p.sub ? `<p>${esc(p.sub)}</p>` : ""}</div>`;
    writeFileSync(tempPage, page_(body));
    await page.goto(`file://${tempPage}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: file });
  }
  process.stdout.write(`\rPictures: ${index + 1} of ${lines.length}`);
}
await browser.close();
rmSync(tempPage, { force: true });
console.log(`\nPictures are in ${framesDir}`);
