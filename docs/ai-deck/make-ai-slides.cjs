// The "suggested AI features" slides: ideas for later, not built yet. Written once, into two places:
//   docs/ai-deck/slides/                       a deck of its own (GoldenDose-AI-Features.pdf)
//   docs/clickguide/slides/project/slides/     the end of the click-by-click guide
//
//   node docs/ai-deck/make-ai-slides.cjs
const fs = require("fs");
const path = require("path");

const OUT = [path.join(__dirname, "slides"), path.join(__dirname, "../clickguide/slides/project/slides")];
const BLOBS_LIGHT =
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:900px;height:900px;border-radius:50%;top:-300px;right:-220px;background:radial-gradient(circle,rgba(19,120,64,0.40) 0%,rgba(0,0,0,0) 68%)"></div>' +
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:780px;height:780px;border-radius:50%;bottom:-300px;left:-200px;background:radial-gradient(circle,rgba(214,168,96,0.58) 0%,rgba(0,0,0,0) 68%)"></div>' +
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:620px;height:620px;border-radius:50%;top:260px;left:560px;background:radial-gradient(circle,rgba(255,255,255,0.70) 0%,rgba(0,0,0,0) 70%)"></div>';
const BLOBS_DARK =
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:900px;height:900px;border-radius:50%;top:-300px;right:-220px;background:radial-gradient(circle,rgba(240,220,170,0.42) 0%,rgba(0,0,0,0) 68%)"></div>' +
  '<div aria-hidden="true" style="position:absolute;z-index:-1;width:780px;height:780px;border-radius:50%;bottom:-300px;left:-200px;background:radial-gradient(circle,rgba(150,210,150,0.40) 0%,rgba(0,0,0,0) 68%)"></div>';
const GLASS = "background:linear-gradient(145deg,rgba(255,255,255,0.78) 0%,rgba(255,255,255,0.40) 46%,rgba(255,255,255,0.22) 100%);backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1.5px solid rgba(255,255,255,0.88);box-shadow:inset 0 2px 0 rgba(255,255,255,0.95),inset 0 -1px 0 rgba(255,255,255,0.40),0 30px 80px rgba(70,56,30,0.20)";
const GLASS_DARK = "background:linear-gradient(145deg,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0.10) 46%,rgba(255,255,255,0.05) 100%);backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1.5px solid rgba(255,255,255,0.38);box-shadow:inset 0 2px 0 rgba(255,255,255,0.45),inset 0 -1px 0 rgba(255,255,255,0.12),0 30px 80px rgba(0,30,10,0.35)";
const FOOT = (n) => `<p style="position:absolute;left:128px;bottom:56px;width:900px;font-size:22px;color:#6B5E45">GoldenDose · Suggested features, not built yet · ${n}</p>`;

function cover() {
  return `<section id="ai0" data-transition="fade" data-theme="glass2" style="position:relative;overflow:hidden;isolation:isolate;background:linear-gradient(135deg,#0A4F2A 0%,#13663A 50%,#4E7A52 100%);color:#FBF6EC;font-family:'Atkinson Hyperlegible', Verdana, sans-serif;padding:128px;display:flex;flex-direction:column;justify-content:center;gap:28px">
${BLOBS_DARK}
<div style="${GLASS_DARK};border-radius:40px;padding:56px 64px;display:flex;flex-direction:column;gap:24px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#E9D7AE">Coming next · Suggested features · Not built yet</p>
<h2 style="font-size:92px;font-weight:700;line-height:1.05">AI that does the work, and asks first</h2>
<p style="font-size:36px;line-height:1.4;color:#D9EDE1;width:1400px">Agentic AI that reads prescriptions and reports, prepares doctor visits, orders refills, and talks with Kamala in her language. The family approves every step. It never gives medical advice.</p>
</div>
<aside>Suggested features for the next stage. None of these are built yet.</aside>
</section>
`;
}

function cards(id, eyebrow, title, items, n, aside, cols = items.length >= 4 ? 4 : items.length) {
  const cells = items.map(([h, t, tag]) => `<div style="${GLASS};border-radius:28px;padding:40px 40px 44px;display:flex;flex-direction:column;gap:16px">
${tag ? `<p style="font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A9773A">${tag}</p>` : ""}
<h3 style="font-size:42px;font-weight:700;color:#0B5A2F;line-height:1.15">${h}</h3>
<p style="font-size:31px;line-height:1.42;color:#45453F">${t}</p>
</div>`).join("\n");
  return `<section id="${id}" data-transition="fade" data-theme="glass2" style="position:relative;overflow:hidden;isolation:isolate;background:linear-gradient(135deg,#F6EFE2 0%,#ECE2CF 52%,#DDE8D7 100%);color:#141414;font-family:'Atkinson Hyperlegible', Verdana, sans-serif;padding:96px 128px 140px;display:flex;flex-direction:column;justify-content:center;gap:48px">
${BLOBS_LIGHT}<div style="display:flex;flex-direction:column;gap:16px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#0B5A2F">${eyebrow}</p>
<h2 style="font-size:76px;font-weight:700;line-height:1.1">${title}</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:28px;align-items:stretch">
${cells}
</div>
${FOOT(n)}
<aside>${aside}</aside>
</section>
`;
}

const SLIDES = {
  ai0: cover(),
  ai1: cards("ai1", "Suggested · For the family · Not built yet", "Agents that take the paperwork away", [
    ["Prescription reader", "Photograph the prescription, even “Tab Glycomet GP1 1-0-1 × 30 days”. It drafts the medicine list, times and what each is for. Priya approves.", "Biggest time-saver"],
    ["Blood report reader", "Photograph the lab report. It fills in the values and the printed ranges for Priya to confirm. The reminders take over from there.", ""],
    ["Doctor visit assistant", "Before: a one-page brief. After: it reads the new prescription and proposes the changes, “Amlodipine 5 → 10 mg”, for approval.", ""],
    ["Refill and lab agent", "Drafts the WhatsApp to the chemist or lab when it's time, follows up if there's no reply, and tracks it to delivery.", ""],
  ], 2, "Agents for the family: they read, draft and follow up. Every change waits for Priya's approval and goes into the change history."),
  ai2: cards("ai2", "Suggested · For Kamala · Not built yet", "Help that speaks her language", [
    ["A voice companion", "Kamala asks out loud, in Hindi or Tamil: “Did I take my morning tablet?” “Which one is for sugar?” Answers only from her records.", ""],
    ["Check-in calls for basic phones", "An automatic call at dose time: “Kamala-ji, did you take your Telma? Press 1 for yes.” For elders without a smartphone.", "Very India-relevant"],
    ["“Is this the right tablet?”", "She points the camera at a strip. “Yes, this is Metformin, your 8 am tablet.”", ""],
  ], 3, "For the elder: voice in her own language, phone calls for basic phones, and a camera check of the strip in her hand."),
  ai3: cards("ai3", "Suggested · For the whole family · Not built yet", "Everyone in the loop, without the effort", [
    ["A weekly family digest", "A warm WhatsApp summary for the siblings' group: doses taken, readings, tests booked, what's next.", ""],
    ["Shared tasks", "“Who's taking Amma to the doctor on Friday?” It assigns, reminds and follows up, all in the change history.", ""],
    ["Patterns, in plain words", "“Most missed doses are on Ekadashi fasting days. Move the 1 pm reminder?” It can change reminder times, never medicines.", ""],
  ], 4, "For the whole family: a weekly digest, shared tasks between brothers and sisters, and patterns explained in plain words."),
  ai4: cards("ai4", "Suggested · Guardrails", "Safe by design", [
    ["Ask before acting", "Every change and every message waits for a family member's tap.", ""],
    ["No medical advice", "It reads, organises, reminds and drafts. Doses and symptoms go to the doctor.", ""],
    ["Everything recorded", "“Suggested by GoldenDose, approved by Priya”, in the change history.", ""],
    ["Private, and affordable", "Only what the family added, with consent (DPDP Act). A few rupees per document or brief.", ""],
  ], 5, "The guardrails that make agentic AI safe here: approval before action, no medical advice, a full record, and privacy."),
  ai5: cards("ai5", "Suggested · Not built yet", "What we'd build first", [
    ["1. Prescription reader", "Removes the most typing, and uses the approvals and change history GoldenDose already has.", ""],
    ["2. Blood report reader", "Feeds the health reminders that already exist: show the doctor, test due, book a home collection.", ""],
    ["3. Doctor visit assistant", "A brief before the visit, and the new prescription turned into approved changes after it.", ""],
  ], 6, "Recommended order: the prescription reader, the blood report reader, then the doctor visit assistant. All three need an Anthropic API key, and cost a few rupees each time they run."),
};

for (const dir of OUT) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, html] of Object.entries(SLIDES)) fs.writeFileSync(path.join(dir, `${id}.html`), html);
}
console.log(`${Object.keys(SLIDES).length} AI slides written to ${OUT.length} decks.`);
