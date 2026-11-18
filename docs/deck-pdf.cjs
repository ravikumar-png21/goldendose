// Turns a slide deck into a PDF, one full-page picture per slide, so the glass look (blur and
// see-through panels) prints exactly as it shows on screen.
//
//   node docs/deck-pdf.cjs why        → docs/Why-GoldenDose.pdf
//   node docs/deck-pdf.cjs clickguide → docs/GoldenDose-Click-by-Click-Guide.pdf
//   node docs/deck-pdf.cjs ai         → docs/GoldenDose-AI-Features.pdf
//   node docs/deck-pdf.cjs walkthrough → docs/GoldenDose-Walkthrough.pdf
//
// Slides point at pictures by their online address (/_blob/<id>). Each deck's blob-map.json says
// which file on this Mac each one is.
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../e2e/node_modules/playwright"));

const DECKS = {
  why: { folder: "why-deck", deck: "why-deck/deck.json", slides: "why-deck/slides", map: "why-deck/blob-map.json", out: "Why-GoldenDose.pdf" },
  walkthrough: { folder: "slides", deck: "slides/project/deck.json", slides: "slides/project/slides", map: null, out: "GoldenDose-Walkthrough.pdf" },
  ai: { folder: "ai-deck", deck: "ai-deck/deck.json", slides: "ai-deck/slides", map: null, out: "GoldenDose-AI-Features.pdf" },
  clickguide: { folder: "clickguide", deck: "clickguide/slides/project/deck.json", slides: "clickguide/slides/project/slides", map: "clickguide/blob-map.json", images: "clickguide/img", out: "GoldenDose-Click-by-Click-Guide.pdf" },
};

const which = DECKS[process.argv[2]];
if (!which) { console.log("Usage: node docs/deck-pdf.cjs why|walkthrough|clickguide|ai"); process.exit(1); }
const at = (p) => path.join(__dirname, p);

const deck = JSON.parse(fs.readFileSync(at(which.deck), "utf8"));
const blobMap = which.map ? JSON.parse(fs.readFileSync(at(which.map), "utf8")) : {};
// A map entry is a file name in the deck's image folder, or a path relative to docs/.
const fileFor = (id) => blobMap[id] && "file://" + (which.images ? at(path.join(which.images, blobMap[id])) : at(blobMap[id]));

const STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; }
  section { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
  aside { display: none; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 22px 24px; border-bottom: 2px solid rgba(11,90,47,0.16); vertical-align: top; }
  th { font-size: 0.9em; color: #45453F; }
  ul, ol { padding-left: 1.2em; }`;
const comparison = `th:last-child, td:last-child { background: rgba(227,242,231,0.62); color: #0B5A2F; font-weight: 700; }`;

(async () => {
  const shotsDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "goldendose-deck-"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const tmp = at(path.join(which.folder, ".slide.html"));

  for (const [i, id] of deck.order.entries()) {
    let html = fs.readFileSync(at(path.join(which.slides, `${id}.html`)), "utf8");
    html = html.replace(/\/_blob\/([a-f0-9]{32})/g, (whole, blob) => fileFor(blob) || whole);
    html = html.replace(/<x-connector[^>]*><\/x-connector>/g,
      '<div style="align-self:center;width:72px;text-align:center;font-size:64px;font-weight:700;color:#0B5A2F">&#8594;</div>');
    fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8">
      <link href="${deck.faces["atkinson-hyperlegible"].href}" rel="stylesheet">
      <style>${STYLE}${process.argv[2] === "why" ? comparison : ""}</style></head><body>${html}</body></html>`);
    await page.goto("file://" + tmp, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(shotsDir, `${String(i).padStart(3, "0")}.jpg`), type: "jpeg", quality: 90 });
    process.stdout.write(`\rSlides: ${i + 1} of ${deck.order.length}`);
  }
  fs.unlinkSync(tmp);

  // One page per picture, 1920 × 1080 like the slides
  const pages = fs.readdirSync(shotsDir).sort().map((f) =>
    `<img src="file://${path.join(shotsDir, f)}" style="display:block;width:1920px;height:1080px;page-break-after:always">`).join("");
  const book = path.join(shotsDir, "book.html");
  fs.writeFileSync(book, `<!doctype html><html><head><style>@page{size:1920px 1080px;margin:0}body{margin:0}img:last-child{page-break-after:auto}</style></head><body>${pages}</body></html>`);
  await page.goto("file://" + book, { waitUntil: "load" });
  const out = at(which.out);
  await page.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true });
  await browser.close();
  fs.rmSync(shotsDir, { recursive: true, force: true });
  console.log(`\nSaved ${out} (${(fs.statSync(out).size / 1_048_576).toFixed(1)} MB, ${deck.order.length} pages)`);
})();
