// Takes one annotated screenshot per click, for the click-by-click guide (docs/clickguide/img/).
// The thing to click is circled in red and numbered, and the rest of the screen is dimmed.
// Run from the e2e folder:  node scripts/click-shots.js
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { BASE, sleep, startTestServer, api, signInPriya, hhmmFromNow, setDemoClock, useDemoClock, demoNow } from "./lib.js";

const outDir = fileURLToPath(new URL("../../docs/clickguide/img/", import.meta.url));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

setDemoClock(process.env.CLICK_CLOCK ?? "22:24"); // the guide's slides say "Taken at 10:26 pm"
// Start with no one at all: Priya creates her account and adds Kamala, as a family really would.
const dbFile = join(mkdtempSync(join(tmpdir(), "goldendose-guide-")), "guide.db");
await startTestServer({ empty: true, dbFile });
const alarmTime = hhmmFromNow(3); // Kamala's first medicine rings 3 minutes after the script starts

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-IN", timezoneId: "Asia/Kolkata" };
const careContext = await browser.newContext(phone);
const elderContext = await browser.newContext(phone);
await useDemoClock(careContext);
await useDemoClock(elderContext);
const care = await careContext.newPage();
const elder = await elderContext.newPage();

let step = 0;

// Circle the target, number it, dim the rest, take the screenshot, then remove the drawing.
async function capture(page, locator, verb) {
  step++;
  if (locator) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(250);
    const box = await locator.boundingBox();
    await page.evaluate(({ box, n, verb }) => {
      const pad = 8;
      const layer = document.createElement("div");
      layer.id = "__annotation";
      layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99999";
      const ring = document.createElement("div");
      ring.style.cssText = `position:fixed;left:${box.x - pad}px;top:${box.y - pad}px;width:${box.width + pad * 2}px;height:${box.height + pad * 2}px;` +
        "border:5px solid #E03131;border-radius:14px;box-shadow:0 0 0 3px #FFFFFF,0 0 0 9999px rgba(20,20,20,0.28)";
      const badgeX = Math.max(6, Math.min(window.innerWidth - 130, box.x - pad - 18));
      const badgeY = box.y - pad - 46 < 6 ? box.y + box.height + pad + 8 : box.y - pad - 46;
      const badge = document.createElement("div");
      badge.style.cssText = `position:fixed;left:${badgeX}px;top:${badgeY}px;display:flex;align-items:center;gap:6px;font:700 17px/1 Verdana,sans-serif`;
      badge.innerHTML = `<span style="width:38px;height:38px;border-radius:50%;background:#E03131;color:#fff;display:grid;place-items:center;border:3px solid #fff">${n}</span>` +
        `<span style="background:#E03131;color:#fff;padding:6px 10px;border-radius:999px;border:3px solid #fff;letter-spacing:.06em">${verb}</span>`;
      layer.append(ring, badge);
      document.body.append(layer);
    }, { box, n: step, verb });
  }
  await page.screenshot({ path: `${outDir}${String(step).padStart(2, "0")}.jpg`, type: "jpeg", quality: 82 });
  await page.evaluate(() => document.getElementById("__annotation")?.remove());
}

async function click(page, locator, verb = "CLICK") {
  await capture(page, locator, verb);
  await locator.click();
  await sleep(900); // the elder's app ignores a second tap within 0.8 seconds
}
async function type(page, locator, text) {
  await capture(page, locator, "TYPE");
  await locator.fill(text);
  await sleep(300);
}

// ===== A. Getting started (family app): Priya's own account, with no one on her list yet =====
await care.goto(`${BASE}/care/`);
await care.getByLabel("Email").waitFor();
await click(care, care.getByRole("link", { name: "Create an account" }));                        // 1
await type(care, care.getByLabel("Your name"), "Priya Sharma");                                   // 2
await type(care, care.getByLabel("Mobile number"), "+91 98000 00010");                           // 3
await type(care, care.getByLabel("Email"), "priya@example.com");                                 // 4
await type(care, care.getByLabel("Password"), "goldendose-demo");                                 // 5
await click(care, care.getByRole("button", { name: "Create account" }));                         // 6
await care.getByRole("heading", { name: "Hello, Priya" }).waitFor();
await click(care, care.getByRole("button", { name: "Sign out" }));                               // 7
await care.getByLabel("Email").waitFor();
await type(care, care.getByLabel("Email"), "priya@example.com");                                 // 8
await type(care, care.getByLabel("Password"), "goldendose-demo");                                 // 9
await click(care, care.getByRole("button", { name: "Sign in" }));                                // 10
await care.getByRole("heading", { name: "Hello, Priya" }).waitFor();

// ===== B. Adding Kamala, then her first medicine =====
await type(care, care.getByLabel("Their name"), "Kamala");                                        // 11
await click(care, care.getByRole("button", { name: "Add person" }));                             // 12
await care.getByRole("heading", { name: "Set up Kamala" }).waitFor();
await capture(care, care.locator(".setup-steps"), "CHECK");                                        // 13
await click(care, care.getByRole("link", { name: "Add a medicine" }));                           // 14
await type(care, care.getByLabel("Medicine name"), "Calcium");                                    // 15
await type(care, care.getByLabel("Strength"), "500 mg");                                          // 16
await type(care, care.getByLabel("Instruction"), "Take one orange tablet with water");           // 17
await type(care, care.getByLabel("What it's for"), "Bone strength (calcium supplement)");        // 18
await type(care, care.getByLabel("Time").first(), alarmTime);                                     // 19
await click(care, care.getByRole("button", { name: "Add another time" }));                       // 20
await click(care, care.getByRole("button", { name: "Remove" }).nth(1));                          // 21
await capture(care, care.locator("label[for=photo]"), "CLICK");                                   // 22 (opens the camera; not pressed here)
await click(care, care.getByRole("radio", { name: "Oval" }).locator(".."));                      // 23
await click(care, care.getByRole("radio", { name: "Orange" }).first().locator(".."));            // 24
await click(care, care.getByRole("button", { name: "Add medicine" }));                           // 25
await care.getByRole("heading", { name: "1 medicine added" }).waitFor();

// Behind the scenes: a second medicine at the same time, so the guide can show "Skip this dose" too.
const token = await signInPriya();
const kamala = (await api("GET", "/api/elders", token))[0];
// Priya's sister Meera has her own account, so Part E can invite her.
await api("POST", "/api/auth/signup", null, { name: "Meera Iyer", phone: "+91 98000 00030", email: "meera@example.com", password: "meera-password" });
await api("POST", `/api/elders/${kamala.id}/medicines`, token, {
  name: "Vitamin C", strength: "500 mg", instruction: "Take one white chewable tablet", purpose: "Vitamin supplement",
  pillShape: "round", pillColor: "#FFFFFF", times: [alarmTime],
});

// ===== C. Connecting Kamala's phone =====
await click(care, care.getByRole("button", { name: "Get a connection code" }));                  // 26
await care.locator("#setup-code-box .code").waitFor();
const code = (await care.locator("#setup-code-box .code").textContent()).replace(/\D/g, "");
await capture(care, care.locator("#setup-code-box .connect-steps"), "READ");                       // 27
await elder.goto(`${BASE}/`);
await elder.getByLabel("Code").waitFor();
await type(elder, elder.getByLabel("Code"), code);                                                // 28
await click(elder, elder.getByRole("button", { name: "Connect" }));                              // 29
await elder.getByRole("heading", { level: 1 }).waitFor();
const connectedHeading = care.getByRole("heading", { name: "Kamala's phone is connected" });
await connectedHeading.waitFor({ timeout: 15_000 });                                                // the setup changes by itself
await capture(care, connectedHeading.locator("xpath=ancestor::li[1]"), "CHECK");                    // 30
await click(care, care.getByRole("link", { name: "Finish" }));                                   // 31
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();

// Behind the scenes: her other medicines, with four weeks of history, so the history, the meter, the report
// and stopping a medicine have something real to show.
for (const m of [
  { name: "Amlodipine", strength: "5 mg", instruction: "Take one pink tablet", purpose: "High blood pressure", pillShape: "oval", pillColor: "#F4A7B9", times: ["09:00"] },
  { name: "Metformin", strength: "500 mg", instruction: "Take one white tablet after food", purpose: "Diabetes (blood sugar)", times: ["08:00", "20:00"] },
  { name: "Vitamin D3", strength: "1000 IU", instruction: "Take one yellow capsule with lunch", purpose: "Vitamin D deficiency; bone strength", pillShape: "capsule", pillColor: "#F2C14E", pillColor2: "#FFFFFF", times: ["13:00"] },
]) await api("POST", `/api/elders/${kamala.id}/medicines`, token, m);
// Example history, in this test copy only (the slides that show it say "Example data"): mostly taken,
// the 1 pm dose missed on 3 of the last 7 days (and rarely before), and two skips.
{
  const db = new DatabaseSync(dbFile);
  const monthAgo = new Date(demoNow() - 30 * 86_400_000).toISOString();
  const schedules = db.prepare(`SELECT s.id, s.time_of_day FROM schedules s JOIN medicines m ON m.id = s.medicine_id
                                WHERE m.name IN ('Amlodipine', 'Metformin', 'Vitamin D3')`).all();
  db.prepare(`UPDATE schedules SET created_at = ? WHERE id IN (${schedules.map((x) => x.id).join(",")})`).run(monthAgo);
  // OR REPLACE: the missed-dose check may already have marked today's earlier doses
  const log = db.prepare("INSERT OR REPLACE INTO dose_log (schedule_id, date, status, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?)");
  const nowHHMM = new Date(demoNow()).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  for (let back = 28; back >= 0; back--) {
    const date = new Date(demoNow() - back * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    for (const s of schedules) {
      if (back === 0 && s.time_of_day > nowHHMM) continue; // today: only the doses already due
      const missed = s.time_of_day === "13:00" && (back <= 6 ? back % 2 === 0 : back % 9 === 0);
      const skipped = (s.time_of_day === "20:00" && back === 10) || (s.time_of_day === "09:00" && back === 17);
      const status = missed ? "missed" : skipped ? "skipped" : "taken";
      const at = new Date(new Date(`${date}T${s.time_of_day}:00+05:30`).getTime() + (missed ? 30 : 4 + (back % 9)) * 60_000).toISOString();
      log.run(s.id, date, status, at, missed ? "system" : "elder");
    }
  }
  db.close();
}
await care.reload();
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();

// ===== D. Kamala's app =====
await click(elder, elder.getByRole("button", { name: "Read aloud" }).first());                   // 32
await elder.evaluate(() => window.scrollTo(0, 0));
await elder.getByRole("alertdialog").waitFor({ timeout: 200_000 });                              // wait for the alarm
await sleep(1200);
await click(elder, elder.getByRole("alertdialog").getByRole("button", { name: "Taken" }));       // 33
await sleep(100);
await capture(elder, null, "");                                                                    // 34 Well done
await sleep(2800);
await elder.getByRole("alertdialog").waitFor();
await click(elder, elder.getByRole("alertdialog").getByRole("button", { name: "Skip this dose" })); // 35
await sleep(1500);
const calcium = elder.locator(".card", { hasText: "Calcium" });
await click(elder, calcium.getByRole("button", { name: "Undo" }));                               // 36
await sleep(800);
await click(elder, calcium.getByRole("button", { name: "Taken" }));                              // 37
await sleep(3000);
await capture(elder, calcium, "DONE");                                                             // 38 the result

// ===== E. Checking and managing (family app) =====
await click(care, care.getByRole("link", { name: "All people" }));                               // 39
await click(care, care.getByRole("link", { name: /^Kamala/ }));                                   // 40
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();
await sleep(500);
await capture(care, care.locator(".dose-row", { hasText: "Calcium" }), "CHECK");                  // 41
await click(care, care.getByRole("link", { name: "Last 7 days", exact: true }));                              // 42
await care.getByRole("heading", { name: "Last 7 days" }).waitFor();
await click(care, care.getByRole("link", { name: "Kamala" }));                                   // 43
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();
await click(care, care.getByRole("link", { name: /How you're told/ }));                          // 44
await care.getByRole("heading", { name: "Alerts and family" }).waitFor();
await click(care, care.getByLabel("SMS"));                                                        // 45
await click(care, care.getByRole("button", { name: "Save" }));                                   // 46
await type(care, care.getByLabel("Their email"), "meera@example.com");                           // 47
await click(care, care.getByLabel("What can they do?"));                                          // 48
await click(care, care.getByRole("button", { name: "Invite" }));                                 // 49
await care.getByText("can now see").waitFor();
await capture(care, care.locator("#invite-ok"), "DONE");                                           // 50
await click(care, care.getByRole("link", { name: "Kamala" }));                                   // 51
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();
await click(care, care.getByRole("link", { name: /^Amlodipine/ }));                               // 52
await care.getByRole("heading", { name: /Change Amlodipine/ }).waitFor();
await click(care, care.getByRole("button", { name: "Stop Amlodipine" }));                        // 53
await click(care, care.getByRole("button", { name: "Keep it" }));                                // 54

// ===== F. Safety and supply: medicine meter, chemist on WhatsApp, language, emergency =====
await type(care, care.getByLabel("Tablets in hand now"), "4");                                    // 55
await click(care, care.getByRole("button", { name: "Save changes" }));                           // 56
await care.getByRole("heading", { name: "Running low" }).waitFor();
await click(care, care.locator("a.card[href$=\"/details\"]"));                                 // 57
await care.getByRole("heading", { name: "Language, hospital and chemist" }).waitFor();
await capture(care, care.getByLabel(/Language of/), "CHOOSE");                                     // 58
await care.getByLabel(/Language of/).selectOption("hi");
await care.getByLabel("Hospital name").fill("City Hospital");
await type(care, care.getByLabel("Hospital phone number"), "+91 80 2222 3333");                   // 59
await care.getByLabel("Chemist's name").fill("Sharma Medical");
await type(care, care.getByLabel("Chemist's WhatsApp number"), "+91 98450 11111");               // 60
await click(care, care.getByRole("button", { name: "Save" }));                                   // 61
await care.getByText("Saved").waitFor();
await click(care, care.getByRole("link", { name: "Kamala" }));                                   // 62
await care.getByRole("heading", { name: "Running low" }).waitFor();
// The WhatsApp button opens WhatsApp, so it's circled but not pressed here.
await capture(care, care.getByRole("link", { name: /Order on WhatsApp/ }), "CLICK");               // 63
await elder.reload();                                                                              // Kamala's phone now speaks Hindi
await elder.getByRole("heading", { level: 1 }).waitFor();
await elder.evaluate(() => window.scrollTo(0, 0));
await click(elder, elder.getByRole("button", { name: "इमरजेंसी" }));                               // 64
await elder.waitForFunction(() => !document.getElementById("em-status").textContent.endsWith("…"), null, { timeout: 15_000 });
console.log("Emergency screen says:", await elder.locator("#em-status").textContent());
await capture(elder, elder.getByRole("link", { name: /City Hospital/ }), "CALL");                   // 65
await click(elder, elder.getByRole("button", { name: "मैं ठीक हूँ" }));                            // 66
await care.reload();
await care.getByRole("heading", { name: /Emergency button pressed/ }).waitFor();
await capture(care, care.locator(".emergency-banner"), "CHECK");                                    // 67

// ===== G. Family records: doctor report, prescriptions, change history, setup check, Ask =====
await click(care, care.getByRole("link", { name: /^Doctor visit report/ }));                      // 68
await care.getByRole("heading", { name: "Each medicine" }).waitFor();
await capture(care, care.getByRole("button", { name: "Print or save as PDF" }), "CLICK");          // 69 (opens the print screen; not pressed)
await capture(care, care.getByRole("link", { name: "Share summary on WhatsApp" }), "CLICK");       // 70 (opens WhatsApp; not pressed)
await click(care, care.locator("a.back"));                       // 71
await click(care, care.getByRole("link", { name: /^Prescriptions/ }));                            // 72
await care.getByRole("heading", { name: "Prescriptions" }).waitFor();
await capture(care, care.locator("label[for=take-photo]"), "CLICK");                              // 73 (opens the camera; a photo is added instead)
const prescription = await care.evaluate(async () => {
  const canvas = Object.assign(document.createElement("canvas"), { width: 900, height: 1200 });
  const g = canvas.getContext("2d");
  g.fillStyle = "#FFFDF7"; g.fillRect(0, 0, 900, 1200);
  g.fillStyle = "#1B3A6B"; g.font = "bold 46px Georgia"; g.fillText("Dr. S. Rao, MD", 60, 100);
  g.font = "28px Georgia"; g.fillText("City Hospital, Bengaluru · Reg. 45821", 60, 150);
  g.fillRect(60, 180, 780, 4);
  g.fillStyle = "#222"; g.font = "30px Georgia";
  ["Name: Kamala, 72 years      Date: 03/10/2026", "", "Rx", "1. Tab Metformin 500 mg      1 - 0 - 1   after food",
   "2. Tab Amlodipine 5 mg       1 - 0 - 0", "3. Cap Vitamin D3 1000 IU    0 - 1 - 0   with lunch",
   "4. Tab Atorvastatin 10 mg    0 - 0 - 1   bedtime", "5. Tab Calcium 500 mg         1 - 0 - 0", "", "Review after 3 months."]
    .forEach((line, i) => g.fillText(line, 60, 260 + i * 64));
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return [...new Uint8Array(await blob.arrayBuffer())];
});
await care.locator("#choose-file").setInputFiles({ name: "prescription.jpg", mimeType: "image/jpeg", buffer: Buffer.from(prescription) });
await care.getByLabel("Doctor").waitFor();
await type(care, care.getByLabel("Doctor"), "Dr. S. Rao");                                        // 74
await type(care, care.getByLabel("Date on the prescription"), "2026-10-03");                       // 75
await click(care, care.getByRole("button", { name: "Save details" }));                           // 76
await care.locator(".prescription-thumb img").waitFor();
await click(care, care.locator("a.back"));                       // 77
await click(care, care.getByRole("link", { name: /^Change history/ }));                           // 78
await care.getByRole("heading", { name: "All changes" }).waitFor();
await capture(care, care.locator(".history-row").first(), "READ");                                 // 79
await click(care, care.locator("a.back"));                       // 80
await click(care, care.getByRole("link", { name: /^Setup check/ }));                              // 81
await care.getByRole("heading", { name: "Setup check" }).waitFor();
await capture(care, care.locator(".check-item").first(), "CHECK");                                 // 82
await click(care, care.locator("a.back"));                       // 83
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();
await click(care, care.getByRole("button", { name: "Ask" }));                                     // 84
const ask = care.getByRole("dialog", { name: "Ask about Kamala" });
await click(care, ask.getByRole("button", { name: "What is each medicine for?" }));               // 85
await ask.locator(".ask-assistant:not(.ask-thinking)").waitFor();
await capture(care, ask.locator(".ask-assistant").last(), "READ");                                 // 86
await click(care, ask.getByRole("button", { name: "Close" }));                                    // 87
// ===== H. Health records: a blood report, the doctor seeing it, a repeat test, BP, a question, weight, the lab =====
async function choose(page, locator, value) {
  await capture(page, locator, "CHOOSE");
  await locator.selectOption(value);
  await sleep(600);
}
await click(care, care.getByRole("link", { name: /^Health records/ }));                                  // 88
await care.getByRole("heading", { name: "Health records" }).waitFor();
await capture(care, care.locator(".attention").first(), "CHECK");                                          // 89
await click(care, care.getByRole("link", { name: "Add a blood report" }));                               // 90
await care.getByRole("heading", { name: "Add a blood report" }).waitFor();
await care.getByLabel("Lab", { exact: true }).fill("City Diagnostics");
await choose(care, care.getByLabel("Test", { exact: true }), "hba1c");                                     // 91
await type(care, care.getByLabel("Result", { exact: true }), "8.2");                                       // 92
await type(care, care.getByLabel("Range on the report: from"), "4");                                       // 93
await type(care, care.getByLabel("to", { exact: true }), "5.6");                                           // 94
await click(care, care.getByRole("button", { name: "Save report" }));                                    // 95
await care.getByRole("heading", { name: "Health records" }).waitFor();
await capture(care, care.locator(".attention .card", { hasText: "outside the printed range" }), "CHECK");  // 96
await capture(care, care.getByRole("link", { name: "Share with the doctor" }), "CLICK");                   // 97 (opens WhatsApp; not pressed)
await click(care, care.getByRole("button", { name: "Doctor has seen it" }));                             // 98
await care.getByText("✓ Doctor has seen it").waitFor();
await choose(care, care.getByLabel("Repeat, as the doctor said:").first(), "3");                           // 99
await care.getByText(/Next test due by/).waitFor();
await choose(care, care.getByLabel("Remind me to check blood pressure"), "7");                             // 100
await care.getByLabel("bottom", { exact: true }).fill("90");
await type(care, care.getByLabel("Doctor's target: top"), "140");                                          // 101
await click(care, care.locator("#bp-settings").getByRole("button", { name: "Save" }));                   // 102
await care.getByText("No blood pressure reading yet").first().waitFor();
await type(care, care.getByLabel("Top number"), "162");                                                    // 103
await type(care, care.getByLabel("Bottom number"), "95");                                                  // 104
await click(care, care.getByRole("button", { name: "Save reading" }));                                   // 105
await care.getByText("Latest BP 162/95 is above the doctor's target").waitFor();
await capture(care, care.locator(".attention .card", { hasText: "above the doctor's target" }), "CHECK");  // 106
await type(care, care.getByLabel("New question"), "Can the evening Metformin be taken with dinner?");      // 107
await click(care, care.getByRole("button", { name: "Add", exact: true }));                               // 108
await care.getByText("Can the evening Metformin be taken with dinner?").waitFor();
await type(care, care.getByLabel("Weight (kg)"), "58.5");                                                  // 109
await click(care, care.locator("#weight-form").getByRole("button", { name: "Save" }));                   // 110
await care.getByText(/Latest: 58\.5 kg/).waitFor();
await care.getByLabel("Lab name").fill("City Diagnostics");
await type(care, care.getByLabel("Lab's WhatsApp number"), "+91 98450 22222");                             // 111
await click(care, care.locator("#lab-settings").getByRole("button", { name: "Save" }));                  // 112
const book = care.getByRole("link", { name: /^Book a home collection/ });
await book.waitFor();
await capture(care, book, "CLICK");                                                                        // 113 (opens WhatsApp; not pressed)
await click(care, care.locator("a.back"));                                                                 // 114
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();
await click(care, care.getByRole("button", { name: "Sign out" }));                               // 115

await browser.close();
console.log(`${step} screenshots saved in ${outDir}`);
process.exit(0);
