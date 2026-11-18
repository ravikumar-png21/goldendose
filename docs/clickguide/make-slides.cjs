// Makes the click-by-click slides (slides/project/slides/c01.html …) from steps.json, one per step,
// in the beige-and-green glass look. Run after changing steps.json or taking new screenshots:
//
//   node docs/clickguide/make-slides.cjs
//
// Each step in steps.json: kind ("Click" or "Step"), app (shown after the number), title, heads (two headings),
// paras (two texts), alt (describes the screenshot), aside (speaker note), and example: true when the
// screenshot shows the example history filled in for the guide (the slide then says "Example data").
// Pictures: blob-map.json says which uploaded picture (/_blob/<id>) is which screenshot (img/NN.jpg).
// A screenshot that hasn't been uploaded yet gets a made-up id, so the PDF and video still find it.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const here = __dirname;
const steps = JSON.parse(fs.readFileSync(path.join(here, "steps.json"), "utf8"));
const mapFile = path.join(here, "blob-map.json");
const blobMap = JSON.parse(fs.readFileSync(mapFile, "utf8"));
const idFor = {};
for (const [id, file] of Object.entries(blobMap)) idFor[file] = id;

const BG = "background:linear-gradient(135deg,#F6EFE2 0%,#ECE2CF 52%,#DDE8D7 100%)";
const CIRCLES =
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:900px;height:900px;border-radius:50%;top:-300px;right:-220px;background:radial-gradient(circle,rgba(19,120,64,0.40) 0%,rgba(0,0,0,0) 68%)"></div>' +
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:780px;height:780px;border-radius:50%;bottom:-300px;left:-200px;background:radial-gradient(circle,rgba(214,168,96,0.58) 0%,rgba(0,0,0,0) 68%)"></div>' +
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:620px;height:620px;border-radius:50%;top:260px;left:560px;background:radial-gradient(circle,rgba(255,255,255,0.70) 0%,rgba(0,0,0,0) 70%)"></div>';
const FRAME = "width:388px;height:840px;object-fit:contain;border-radius:28px;border:10px solid rgba(255,255,255,0.90);box-shadow:0 0 0 1px rgba(255,255,255,0.95),0 0 40px rgba(255,255,255,0.35),0 34px 80px rgba(30,40,25,0.32)";
const GLASS = "background:linear-gradient(145deg,rgba(255,255,255,0.78) 0%,rgba(255,255,255,0.40) 46%,rgba(255,255,255,0.22) 100%);backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1.5px solid rgba(255,255,255,0.88);box-shadow:inset 0 2px 0 rgba(255,255,255,0.95),inset 0 -1px 0 rgba(255,255,255,0.40),0 30px 80px rgba(70,56,30,0.20);border-radius:40px;padding:56px 64px;flex:1;display:flex;flex-direction:column;gap:28px";

let added = 0;
steps.forEach((s, i) => {
  const n = i + 1;
  const id = `c${String(n).padStart(2, "0")}`;
  const file = `${String(n).padStart(2, "0")}.jpg`;
  if (!idFor[file]) {
    idFor[file] = crypto.createHash("md5").update(`goldendose-click-${file}-not-uploaded`).digest("hex");
    blobMap[idFor[file]] = file;
    added++;
  }
  const html = `<section id="${id}" data-transition="fade" data-theme="glass2" style="position:relative;overflow:hidden;isolation:isolate;${BG};color:#141414;font-family:'Atkinson Hyperlegible', Verdana, sans-serif;padding:96px 128px 128px;display:flex;flex-direction:row;align-items:center;gap:80px">
${CIRCLES}
<img src="/_blob/${idFor[file]}" alt="${s.alt}" style="${FRAME}">
<div style="${GLASS}">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#0B5A2F">${s.kind} ${n} of ${steps.length} · ${s.app}</p>
<h2 style="font-size:60px;font-weight:700;line-height:1.1">${s.title}</h2>${s.example ? `
<p style="align-self:flex-start;font-size:22px;font-weight:700;color:#6B3A00;background:rgba(255,241,220,0.9);border:2px solid #C9A36A;border-radius:999px;padding:6px 18px">Example data: the past weeks were filled in for this guide</p>` : ""}
<div style="display:flex;flex-direction:column;gap:10px;border-left:6px solid #0B5A2F;padding:4px 0 4px 28px">
<p style="font-size:24px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0B5A2F">${s.heads[0]}</p>
<p style="font-size:34px;line-height:1.4">${s.paras[0]}</p>
</div>
<div style="display:flex;flex-direction:column;gap:10px;border-left:6px solid #C9A36A;padding:4px 0 4px 28px">
<p style="font-size:24px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#45453F">${s.heads[1]}</p>
<p style="font-size:30px;line-height:1.4;color:#45453F">${s.paras[1]}</p>
</div>
</div>
<p style="position:absolute;right:128px;bottom:48px;width:600px;text-align:right;font-size:24px;color:#6B5E45">GoldenDose · Click-by-click guide</p>
<aside>${s.aside}</aside>
</section>
`;
  fs.writeFileSync(path.join(here, "slides/project/slides", `${id}.html`), html);
});
fs.writeFileSync(mapFile, JSON.stringify(blobMap, null, 2));
console.log(`${steps.length} click slides made${added ? ` (${added} pictures not uploaded yet)` : ""}.`);
