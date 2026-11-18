// Part 1 of the click-by-click video: turns each slide into a picture, and writes the narration.
//
//   docs/clickguide/video/frames/NN-<id>.png   one picture per slide, in deck order
//   docs/clickguide/video/narration.json        what the voice says on each slide (edit it freely)
//
// The narration file is only written if it doesn't exist yet, so your edits are kept.
// To start the narration again from the slides, delete narration.json first.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const guide = fileURLToPath(new URL("../../../docs/clickguide/", import.meta.url));
const slidesDir = `${guide}slides/project/slides/`;
const outDir = `${guide}video/`;
const framesDir = `${outDir}frames/`;
const narrationFile = `${outDir}narration.json`;

const deck = JSON.parse(readFileSync(`${guide}slides/project/deck.json`, "utf8"));
const blobMap = JSON.parse(readFileSync(`${guide}blob-map.json`, "utf8"));

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

// The slide files point at pictures by their online address (/_blob/<id>). Point them at the files on this Mac.
function withLocalPictures(html) {
  return html.replace(/\/_blob\/([0-9a-f]{32})/g, (whole, id) => (blobMap[id] ? `${guide}img/${blobMap[id]}` : whole));
}

// A slide is one <section> on a 1920×1080 canvas. This page gives it that canvas.
function pageFor(sectionHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }
  section { width: 1920px; height: 1080px; box-sizing: border-box; position: relative; overflow: hidden; }
  h1, h2, h3, p, ul, ol { margin: 0; }
  aside { display: none; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.35em 0.6em; border-bottom: 1px solid #D6D5CE; }
</style></head><body>${sectionHtml}</body></html>`;
}

// What the voice says, built from the slide's own words.
async function narrationFor(page, id) {
  return page.evaluate((id) => {
    // Make text speakable: "→" becomes "then", "·" a comma, and the address is said in words.
    const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").replace(/→/g, ", then")
      .replace(/ · /g, ", ").replace(/localhost:3000\/care\//g, "localhost 3000 slash care").trim() : "");
    const section = document.querySelector("section");
    const sentence = (s) => (s && !/[.!?]"?$/.test(s) ? `${s}.` : s);

    // A warm, polite tone: friendly openers, a welcome and a thank-you, and short pauses from punctuation.
    if (id === "cover") {
      return "Hello, and a very warm welcome. Thank you so much for taking the time to be here. "
        + "This is GoldenDose: a gentle medicine reminder for older people, with a companion app for their family. "
        + "Together, we'll walk through both apps, one click at a time, nice and slowly, and I'll explain what each click does. "
        + "Shall we begin?";
    }
    if (id === "legend") {
      return "Before we start, a quick note on how to read this guide. There's one slide for every click. "
        + "A red circle shows exactly where to click, and the rest of the screen is gently dimmed, so you always know where to look. "
        + "The little red badge shows the step number, and what to do: click, type, read, check, or done.";
    }
    if (id === "end") {
      return "And that's every click. Thank you for staying with me all the way. "
        + "The everyday routine is really just three taps. "
        + "For Kamala: when the alarm rings, take the pill, and gently tap Taken. "
        + "For Priya: open her name to see today. The alerts come all by themselves. "
        + "And the setup is needed only once. "
        + "Thank you so much for your time, and your kind attention. "
        + "We truly hope GoldenDose brings comfort and peace of mind to you, and to the people you care about. Take care.";
    }

    const lowerFirst = (s) => (/^(The|A|An|Back|Your|Move|Click|Pick|That|Next|Choose|Kamala's page|It)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
    const eyebrow = text(section.querySelector("p"));
    const heading = text(section.querySelector("h1, h2"));
    const step = eyebrow.match(/^(Click|Step) (\d+) of 50/);

    if (step) {
      // A click slide: its two labelled blocks are "What it does" and "What happens next" (or "Here").
      const n = Number(step[2]);
      const blocks = [...section.querySelectorAll("div > div")].filter((d) => d.children.length === 2 && d.querySelector("p + p"));
      const [does, next] = blocks.map((b) => text(b.children[1]));
      const nextLabel = blocks[1] ? text(blocks[1].children[0]).toLowerCase() : "";

      // "Click X" becomes a gentle, polite request, varied so it doesn't sound repetitive.
      const openers = ["When you're ready, please", "Now, please", "Next, kindly", "Now, if you would, please"];
      const ask = /^(Click|Pressed|When)/.test(heading)
        ? (heading.startsWith("Click") ? `${n === 1 ? "First, please" : openers[n % openers.length]} ${lowerFirst(heading)}` : heading)
        : heading;
      // "Opens the form" becomes "This opens the form".
      const explain = /^[A-Z][a-z]+s\b/.test(does) && !/^(Kamala's|Priya's)/.test(does) ? `This ${does[0].toLowerCase()}${does.slice(1)}` : does;
      // Small smiles: warm praise when something succeeds, and a little encouragement after key clicks.
      const praises = ["Wonderful!", "Well done!", "Lovely!"];
      const praise = step[1] === "Step" && /done|confirms|worked|means/i.test(heading) ? `${praises[n % praises.length]} ` : "";
      const smiles = ["Nicely done.", "That's all there is to it.", "Easy, isn't it?"];
      const smile = /"(Create account|Sign in|Add medicine|Connect|Save|Invite)"/.test(heading) ? smiles[n % smiles.length] : "";
      const then = next ? (nextLabel === "here" ? `Here, ${lowerFirst(next)}` : `After that, ${lowerFirst(next)}`) : "";
      return [`Step ${n}.`, praise + sentence(ask), sentence(explain), sentence(then), smile].filter(Boolean).join(" ");
    }

    // Section slides: introduce the part warmly.
    const heading2 = text(section.querySelector("h2"));
    const intro = text(section.querySelectorAll("p")[1]);
    const part = eyebrow.match(/^Part ([A-E])/);
    if (part) {
      const range = eyebrow.match(/Clicks? (\d+)–(\d+)/);
      // Every section intro starts with a verb ("Create a family account…"), so it reads as "we'll create…".
      return `Now, whenever you're ready, let's move on to Part ${part[1]}: ${heading2}. ${range ? `That's clicks ${range[1]} to ${range[2]}.` : ""} In this part, we'll ${intro[0].toLowerCase()}${sentence(intro).slice(1)}`;
    }
    return [eyebrow, heading2, intro].filter(Boolean).map(sentence).join(" ");
  }, id);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const tempPage = `${outDir}slide.html`;
const narration = {};

for (const [index, id] of deck.order.entries()) {
  const section = readFileSync(`${slidesDir}${id}.html`, "utf8");
  writeFileSync(tempPage, pageFor(withLocalPictures(section)));
  await page.goto(`file://${tempPage}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${framesDir}${String(index + 1).padStart(2, "0")}-${id}.png` });
  narration[id] = await narrationFor(page, id);
}
await browser.close();
rmSync(tempPage, { force: true });

if (existsSync(narrationFile)) {
  console.log(`Pictures made: ${deck.order.length}. Kept your existing narration.json.`);
} else {
  writeFileSync(narrationFile, JSON.stringify(narration, null, 2) + "\n");
  console.log(`Pictures made: ${deck.order.length}. Narration written to ${narrationFile}`);
}
