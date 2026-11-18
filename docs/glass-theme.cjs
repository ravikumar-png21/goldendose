// The GoldenDose slide look: frosted glass on beige and green ("glassmorphism").
//
//   node docs/glass-theme.cjs docs/why-deck/slides docs/clickguide/slides/project/slides
//
// Rewrites each slide file in place. Every style stays inline, so the slides look the same in the
// PDF, in the video and in the published deck. A slide that already has the look is left alone.
//
// What changes:
//   - Light slides get a warm beige background; covers and section slides a deep green one.
//   - Two soft blurred circles (green and gold) sit behind the content, so the glass has something to blur.
//   - Text columns and cards become frosted glass panels: see-through white, blurred, with a light edge.
//   - Red and yellow accents become green and soft gold, so the whole deck is beige and green.
const fs = require("fs");
const path = require("path");

const BEIGE_BG = "linear-gradient(135deg,#F6EFE2 0%,#ECE2CF 52%,#DDE8D7 100%)";
const GREEN_BG = "linear-gradient(135deg,#0A4F2A 0%,#13663A 50%,#4E7A52 100%)";
const BLUR = "backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%)";
const GLASS_LIGHT = `background:rgba(255,255,255,0.46);${BLUR};border:1.5px solid rgba(255,255,255,0.75);box-shadow:0 22px 60px rgba(70,56,30,0.14)`;
const GLASS_DARK = `background:rgba(255,255,255,0.10);${BLUR};border:1.5px solid rgba(255,255,255,0.28);box-shadow:0 22px 60px rgba(0,30,10,0.25)`;

// Two soft circles behind everything. z-index -1 inside an isolated section: above its background, below its content.
const blobs = (dark) => `<div aria-hidden="true" style="position:absolute;z-index:-1;width:820px;height:820px;border-radius:50%;top:-260px;right:-200px;background:radial-gradient(circle,${dark ? "rgba(233,215,174,0.30)" : "rgba(19,102,58,0.26)"} 0%,rgba(0,0,0,0) 70%)"></div>` +
  `<div aria-hidden="true" style="position:absolute;z-index:-1;width:700px;height:700px;border-radius:50%;bottom:-280px;left:-180px;background:radial-gradient(circle,${dark ? "rgba(140,190,140,0.30)" : "rgba(201,163,106,0.40)"} 0%,rgba(0,0,0,0) 70%)"></div>`;

function glassify(html) {
  if (/data-theme="glass2?"/.test(html)) return html; // already has the look (version 1 or 2)
  const open = html.match(/<section\b[^>]*>/)[0];
  const dark = /background:#(141414|0B5A2F|0E6B39)/i.test(open);

  // 1. The slide itself
  let section = open
    .replace(/background:#[0-9A-Fa-f]{6}/, `background:${dark ? GREEN_BG : BEIGE_BG}`)
    .replace(/color:#F6F5F0/, "color:#FBF6EC")
    .replace(/style="/, 'data-theme="glass" style="position:relative;overflow:hidden;isolation:isolate;');
  let body = html.slice(html.indexOf(open) + open.length);

  // 2. Cards that had a solid fill become glass
  const hadCards = /background:#(FFFFFF|F6F5F0|FFF1DC|ECEBE5|E3F2E7)/i.test(body);
  body = body
    .replace(/background:#(FFFFFF|F6F5F0)/gi, GLASS_LIGHT.replace(/;border:[^;]+/, ""))
    .replace(/background:#FFF1DC/gi, `background:rgba(255,241,220,0.62);${BLUR}`)
    .replace(/background:#ECEBE5/gi, `background:rgba(236,230,214,0.58);${BLUR}`)
    .replace(/background:#E3F2E7/gi, `background:rgba(227,242,231,0.62);${BLUR}`)
    .replace(/background:#(0E6B39|0B5A2F)/gi, `background:rgba(11,90,47,0.85);${BLUR}`)
    .replace(/background:#141414/gi, `background:rgba(16,40,24,0.72);${BLUR}`)
    .replace(/background:#FFD23F/gi, "background:rgba(233,215,174,0.85)");

  // 3. Lines and frames
  body = body
    .replace(/border:2px solid #D6D5CE/gi, "border:1.5px solid rgba(255,255,255,0.8)")
    .replace(/border-bottom:2px solid #(D6D5CE|C9C8C0)/gi, "border-bottom:2px solid rgba(11,90,47,0.16)")
    .replace(/border:6px solid #(141414|F6F5F0)/gi, "border:10px solid rgba(255,255,255,0.82);box-shadow:0 30px 70px rgba(30,40,25,0.28)")
    .replace(/border-top:4px solid #FFD23F/gi, "border-top:4px solid #C9A36A")
    .replace(/border-left:6px solid #8A8A82/gi, "border-left:6px solid #C9A36A")
    .replace(/border:3px solid #6B3A00/gi, "border:2px solid rgba(107,58,0,0.45)")
    .replace(/border-left:6px solid #6B3A00/gi, "border-left:6px solid #A9773A");

  // 4. Accent colours: beige and green only
  body = body
    .replace(/color:#C92A2A/gi, "color:#0B5A2F")
    .replace(/color:#FFD23F/gi, "color:#E9D7AE")
    .replace(/color:#D9D8D0/gi, "color:#EFE7D6")
    .replace(/color:#A9A89F/gi, "color:#D8CDB5")
    .replace(/color:#6B6A63/gi, "color:#6B5E45");

  // 5. A glass panel for the main text, if the slide doesn't already have glass cards.
  //    Side-by-side slides: the text column. Other slides: everything except the speaker notes.
  if (!hadCards || /flex:1;display:flex;flex-direction:column/.test(body)) {
    const glass = (dark ? GLASS_DARK : GLASS_LIGHT) + ";border-radius:40px;padding:56px 64px";
    if (/<div style="flex:1;display:flex;flex-direction:column/.test(body) && !hadCards) {
      body = body.replace(/<div style="flex:1;display:flex;flex-direction:column/, `<div style="${glass};flex:1;display:flex;flex-direction:column`);
    } else if (!hadCards) {
      const end = body.search(/<aside>|<\/section>/);
      const footer = body.slice(0, end).match(/<p style="position:absolute[\s\S]*?<\/p>\s*$/);
      const contentEnd = footer ? end - footer[0].length : end;
      body = `<div style="${glass};display:flex;flex-direction:column;gap:28px">` + body.slice(0, contentEnd) + "</div>\n" + body.slice(contentEnd);
    }
  }

  return html.slice(0, html.indexOf(open)) + section + "\n" + blobs(dark) + body;
}

module.exports = { glassify };
// ---------- Version 2: more glass, with gloss ----------
// Glossier panels: a light sheen from the top-left (a gradient instead of a flat tint), a bright
// highlight line along the top edge, a softer glow underneath, and stronger, more colourful
// background circles for the glass to blur. Upgrades slides that have version 1.
const SHEEN_LIGHT = "background:linear-gradient(145deg,rgba(255,255,255,0.78) 0%,rgba(255,255,255,0.40) 46%,rgba(255,255,255,0.22) 100%)";
const SHEEN_DARK = "background:linear-gradient(145deg,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0.10) 46%,rgba(255,255,255,0.05) 100%)";
const BLUR2 = "backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%)";
const GLOW_LIGHT = "box-shadow:inset 0 2px 0 rgba(255,255,255,0.95),inset 0 -1px 0 rgba(255,255,255,0.40),0 30px 80px rgba(70,56,30,0.20)";
const GLOW_DARK = "box-shadow:inset 0 2px 0 rgba(255,255,255,0.45),inset 0 -1px 0 rgba(255,255,255,0.12),0 30px 80px rgba(0,30,10,0.35)";

const blobs2 = (dark) =>
  `<div aria-hidden="true" style="position:absolute;z-index:-1;width:900px;height:900px;border-radius:50%;top:-300px;right:-220px;background:radial-gradient(circle,${dark ? "rgba(240,220,170,0.42)" : "rgba(19,120,64,0.40)"} 0%,rgba(0,0,0,0) 68%)"></div>` +
  `<div aria-hidden="true" style="position:absolute;z-index:-1;width:780px;height:780px;border-radius:50%;bottom:-300px;left:-200px;background:radial-gradient(circle,${dark ? "rgba(150,210,150,0.40)" : "rgba(214,168,96,0.58)"} 0%,rgba(0,0,0,0) 68%)"></div>` +
  `<div aria-hidden="true" style="position:absolute;z-index:-1;width:620px;height:620px;border-radius:50%;top:260px;left:560px;background:radial-gradient(circle,${dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.70)"} 0%,rgba(0,0,0,0) 70%)"></div>`;

function gloss(html) {
  if (html.includes('data-theme="glass2"')) return html;
  if (!html.includes('data-theme="glass"')) html = glassify(html);
  const dark = html.includes(GREEN_BG);
  html = html.replace('data-theme="glass"', 'data-theme="glass2"');
  // background circles: replace version 1's two with version 2's three
  html = html.replace(/<div aria-hidden="true" style="position:absolute;z-index:-1;[^"]*"><\/div>/g, "");
  html = html.replace(/(<section\b[^>]*>\n?)/, `$1${blobs2(dark)}`);
  // panels and cards: sheen, stronger blur, top highlight
  html = html
    .replace(/background:rgba\(255,255,255,0\.46\);backdrop-filter:blur\(20px\) saturate\(140%\);-webkit-backdrop-filter:blur\(20px\) saturate\(140%\);border:1\.5px solid rgba\(255,255,255,0\.75\);box-shadow:0 22px 60px rgba\(70,56,30,0\.14\)/g,
      `${SHEEN_LIGHT};${BLUR2};border:1.5px solid rgba(255,255,255,0.88);${GLOW_LIGHT}`)
    .replace(/background:rgba\(255,255,255,0\.46\);backdrop-filter:blur\(20px\) saturate\(140%\);-webkit-backdrop-filter:blur\(20px\) saturate\(140%\);box-shadow:0 22px 60px rgba\(70,56,30,0\.14\)/g,
      `${SHEEN_LIGHT};${BLUR2};${GLOW_LIGHT}`)
    .replace(/background:rgba\(255,255,255,0\.10\);backdrop-filter:blur\(20px\) saturate\(140%\);-webkit-backdrop-filter:blur\(20px\) saturate\(140%\);border:1\.5px solid rgba\(255,255,255,0\.28\);box-shadow:0 22px 60px rgba\(0,30,10,0\.25\)/g,
      `${SHEEN_DARK};${BLUR2};border:1.5px solid rgba(255,255,255,0.38);${GLOW_DARK}`)
    .replace(/backdrop-filter:blur\(20px\) saturate\(140%\);-webkit-backdrop-filter:blur\(20px\) saturate\(140%\)/g, BLUR2)
    // screenshots: a glossy white frame with a soft glow
    .replace(/border:10px solid rgba\(255,255,255,0\.82\);box-shadow:0 30px 70px rgba\(30,40,25,0\.28\)/g,
      "border:10px solid rgba(255,255,255,0.90);box-shadow:0 0 0 1px rgba(255,255,255,0.95),0 0 40px rgba(255,255,255,0.35),0 34px 80px rgba(30,40,25,0.32)");
  return html;
}

module.exports.gloss = gloss;


if (require.main === module) {
  for (const folder of process.argv.slice(2)) {
    let n = 0;
    for (const file of fs.readdirSync(folder).filter((f) => f.endsWith(".html"))) {
      const full = path.join(folder, file);
      const before = fs.readFileSync(full, "utf8");
      const after = gloss(glassify(before));
      if (after !== before) { fs.writeFileSync(full, after); n++; }
    }
    console.log(`${folder}: ${n} slides given the glass look`);
  }
}
