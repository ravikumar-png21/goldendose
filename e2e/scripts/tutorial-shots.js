// Takes a screenshot of every screen in both apps, for the written tutorial (docs/tutorial/).
// Run from the e2e folder:  node scripts/tutorial-shots.js
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE, sleep, startTestServer, api, signInPriya, kamalaOf, clearDueDoses, hhmmFromNow, setDemoClock, useDemoClock } from "./lib.js";

const outDir = fileURLToPath(new URL("../../docs/tutorial/img/", import.meta.url));
mkdirSync(outDir, { recursive: true });
const shot = (target, name, options = {}) =>
  target.screenshot({ path: `${outDir}${name}.jpg`, type: "jpeg", quality: 82, ...options });

setDemoClock("20:14"); // the written tutorial says "Taken at 8:14 pm"
await startTestServer();
const token = await signInPriya();
const kamala = await kamalaOf(token);
await clearDueDoses(token, kamala.id);
await api("POST", `/api/elders/${kamala.id}/medicines`, token, {
  name: "Vitamin B12", strength: "1500 mcg", instruction: "Take one small pink tablet after breakfast",
  pillShape: "round", pillColor: "#F4A7B9", times: [hhmmFromNow(20)],
});

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-IN", timezoneId: "Asia/Kolkata" };

// ---------- Kamala's app ----------
const elderContext = await browser.newContext(phone);
await useDemoClock(elderContext);
const elder = await elderContext.newPage();
await elder.goto(`${BASE}/`);
await shot(elder, "k1-pairing");

await elder.getByLabel("Code").fill("123");
await elder.getByRole("button", { name: "Connect" }).click();
await shot(elder, "k2-pairing-error");

const { code } = await api("POST", `/api/elders/${kamala.id}/pairing-code`, token);
await elder.getByLabel("Code").fill(code);
await elder.getByRole("button", { name: "Connect" }).click();
await elder.getByRole("heading", { level: 1 }).waitFor();
await sleep(800);
await shot(elder, "k3-today");
await shot(elder.locator(".card", { hasText: "Not taken yet" }).first(), "k4-card-not-taken");
await shot(elder.locator(".card-later").first(), "k5-card-later");
await shot(elder.locator(".card", { hasText: "Vitamin B12" }), "k6-card-soon");

await api("POST", `/api/elders/${kamala.id}/medicines`, token, {
  name: "Calcium", strength: "500 mg", instruction: "Take one orange tablet with water",
  pillShape: "oval", pillColor: "#F29B4E", times: [hhmmFromNow(0)],
});
await elder.reload();
await elder.getByRole("alertdialog").waitFor();
await sleep(1500);
await shot(elder, "k7-alarm");

await elder.getByRole("alertdialog").getByRole("button", { name: "Taken" }).click();
await sleep(500);
await shot(elder, "k8-well-done");
await sleep(2800);
await shot(elder.locator(".card", { hasText: "Calcium" }), "k9-card-taken");

await elderContext.setOffline(true);
await sleep(900);
await elder.locator(".card", { hasText: "Vitamin B12" }).getByRole("button", { name: "Taken" }).click();
await sleep(3200);
await elder.evaluate(() => window.scrollTo(0, 0));
await sleep(300);
await shot(elder, "k10-offline");
await elderContext.setOffline(false);

// ---------- Priya's family app ----------
const careContext = await browser.newContext(phone);
await useDemoClock(careContext);
const care = await careContext.newPage();
await care.goto(`${BASE}/care/`);
await care.getByLabel("Email").waitFor();
await shot(care, "c1-sign-in");
await care.goto(`${BASE}/care/#/signup`);
await care.getByLabel("Your name").waitFor();
await shot(care, "c2-create-account");

await care.goto(`${BASE}/care/#/signin`);
await care.getByLabel("Email").fill("priya@example.com");
await care.getByLabel("Password").fill("goldendose-demo");
await care.getByRole("button", { name: "Sign in" }).click();
await care.getByRole("heading", { name: "Hello, Priya" }).waitFor();
await shot(care, "c3-people", { fullPage: true });

await care.getByRole("link", { name: /^Kamala/ }).click();
await care.getByRole("heading", { name: "Kamala", level: 1 }).waitFor();
await sleep(400);
await shot(care, "c4-person", { fullPage: true });
await care.getByRole("button", { name: "Get a connection code" }).click();
await care.locator(".code").waitFor();
await shot(care.locator(".code-box"), "c5-connection-code");

await care.getByRole("link", { name: "Add a medicine" }).click();
await care.getByLabel("Medicine name").fill("Pantoprazole");
await care.getByLabel("Strength").fill("40 mg");
await care.getByLabel("Instruction").fill("Take one yellow tablet before breakfast");
await care.getByLabel("Time").first().fill("07:30");
await care.getByRole("radio", { name: "Oval" }).check();
await care.getByRole("radio", { name: "Yellow" }).first().check();
await care.evaluate(() => window.scrollTo(0, 0));
await shot(care, "c6-add-medicine", { fullPage: true });

await care.goto(`${BASE}/care/#/elder/${kamala.id}`);
await care.getByRole("link", { name: /^Amlodipine/ }).click();
await care.getByRole("button", { name: "Stop Amlodipine" }).click();
await care.getByText("Stop Amlodipine?").waitFor();
await shot(care.locator("section", { has: care.getByRole("heading", { name: "Stop this medicine" }) }), "c7-stop-medicine");

await care.goto(`${BASE}/care/#/elder/${kamala.id}/history`);
await care.getByRole("heading", { name: "Last 7 days" }).waitFor();
await shot(care, "c8-history", { fullPage: true });

await care.goto(`${BASE}/care/#/elder/${kamala.id}/settings`);
await care.getByRole("heading", { name: "Alerts and family" }).waitFor();
await shot(care, "c9-alerts-and-family", { fullPage: true });

await browser.close();
console.log(`Screenshots saved in ${outDir}`);
process.exit(0);
