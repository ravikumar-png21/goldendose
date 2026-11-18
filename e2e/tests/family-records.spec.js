// The family's records and reports: what each medicine is for, Needs attention, the doctor visit report,
// prescriptions, the change history with approval, the setup check, and Ask GoldenDose.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRIYA, signInPriya, newElder } from "./helpers.js";

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function accessible(page) {
  const results = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
}

async function signIn(page) {
  await page.goto("/care/");
  await page.getByLabel("Email").fill(PRIYA.email);
  await page.getByLabel("Password").fill(PRIYA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
}

test("Typing a brand name suggests what it's usually for, and Use this fills it in", async ({ page, request }) => {
  const token = await signInPriya(request);
  const elder = await newElder(request, token, []);
  await signIn(page);
  await page.goto(`/care/#/elder/${elder.id}/add`);
  await page.getByLabel("Medicine name").fill("Glycomet 500");
  await expect(page.getByText("is usually used for:")).toBeVisible();
  await expect(page.getByText(/not medical advice/)).toBeVisible();
  await page.getByRole("button", { name: "Use this" }).click();
  await expect(page.getByLabel("What it's for")).toHaveValue("Diabetes (blood sugar)");
  await page.getByRole("button", { name: "Add medicine" }).click();
  await expect(page.getByText("For: Diabetes (blood sugar)")).toBeVisible();
});

test("Needs attention shows on the home page, and the new record pages pass the accessibility check", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await accessible(page);

  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("link", { name: /^Doctor visit report/ }).click();
  await expect(page.getByRole("heading", { name: "Each medicine" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Metformin 500 mg .*Diabetes/ })).toBeVisible();
  await accessible(page);

  await page.goto("/care/#/elder/1/prescriptions");
  await expect(page.getByText("No prescriptions yet.")).toBeVisible();
  await accessible(page);

  await page.goto("/care/#/elder/1/changes");
  await expect(page.getByRole("heading", { name: "Medicine list on a past date" })).toBeVisible();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.locator("#on-date-result")).toContainText("Metformin");
  await accessible(page);

  await page.goto("/care/#/elder/1/checkup");
  await expect(page.getByText(/of \d+ done/)).toBeVisible();
  await accessible(page);
});

test("A prescription photo uploads, gets its doctor and date, and can be removed", async ({ page }) => {
  await signIn(page);
  await page.goto("/care/#/elder/1/prescriptions");
  // A small, real JPEG made in the page
  const jpeg = await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 300, height: 400 });
    const g = canvas.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 300, 400); g.fillStyle = "#000"; g.fillText("Rx Metformin 500 1-0-1", 20, 40);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg"));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.locator("#choose-file").setInputFiles({ name: "prescription.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
  await page.getByLabel("Doctor").fill("Dr. Rao");
  await page.getByLabel("Date on the prescription").fill("2026-10-03");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(/Dr\. Rao · /)).toBeVisible();
  await expect(page.locator(".prescription-thumb img")).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByText("No prescriptions yet.")).toBeVisible();
});

test("With approval on, Arjun's change waits until Priya approves it", async ({ page, request }) => {
  const priya = await signInPriya(request);
  const elder = await newElder(request, priya, [{ name: "Telma", strength: "40", times: ["21:00"] }]);
  await request.post(`/api/elders/${elder.id}/caregivers`, { headers: { Authorization: `Bearer ${priya}` }, data: { email: "arjun@example.com" } });
  await request.put(`/api/elders/${elder.id}/profile`, { headers: { Authorization: `Bearer ${priya}` }, data: { requireApproval: true } });

  // Arjun asks to move the time
  await page.goto("/care/");
  await page.getByLabel("Email").fill("arjun@example.com");
  await page.getByLabel("Password").fill(PRIYA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Arjun" })).toBeVisible();
  await page.goto(`/care/#/elder/${elder.id}`);
  await page.getByRole("link", { name: /^Telma/ }).click();
  await page.getByLabel("Time").fill("22:00");
  await page.getByLabel(/Why the change/).fill("Doctor said after dinner");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Sent for approval: change Telma 40: times 9:00 pm → 10:00 pm/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // Priya approves
  await signIn(page);
  await page.goto(`/care/#/elder/${elder.id}/changes`);
  await expect(page.getByText("Arjun Sharma wants to change Telma 40: times 9:00 pm → 10:00 pm")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Changed Telma 40: times 9:00 pm → 10:00 pm \(approved by Priya Sharma\)/)).toBeVisible();
  await expect(page.getByText("Why: Doctor said after dinner")).toBeVisible();
});

test("Ask GoldenDose answers from the records, and won't give medical advice", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("button", { name: "Ask" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask about Kamala" });
  await expect(dialog).toBeVisible();
  await accessible(page);

  await dialog.getByRole("button", { name: "What is each medicine for?" }).click();
  await expect(dialog.getByText(/Metformin: Diabetes \(blood sugar\)/)).toBeVisible();

  await dialog.getByLabel("Your question").fill("Can she take an extra tablet of Metformin?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(/question for Kamala's doctor or pharmacist/)).toBeVisible();
});

test("Once the elder's phone is connected, the page says so, and the code is only for a new phone", async ({ page, request }) => {
  const token = await signInPriya(request);
  const elder = await newElder(request, token, [{ name: "Telma", times: ["21:00"] }]);
  await signIn(page);
  await page.goto(`/care/#/elder/${elder.id}`);
  await expect(page.getByRole("button", { name: "Get a connection code" })).toBeVisible(); // not connected yet

  const code = await (await request.post(`/api/elders/${elder.id}/pairing-code`, { headers: { Authorization: `Bearer ${token}` } })).json();
  await request.post("/api/devices/pair", { data: { code: code.code } });
  await page.reload();
  await expect(page.getByText(/^✓ Connected/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Get a connection code" })).toBeHidden();
  await page.getByText("New or replacement phone?").click();
  await expect(page.getByRole("button", { name: "Get a connection code" })).toBeVisible();
});

test("Disconnect this phone: Priya disconnects a lost phone, and it goes back to asking for a code", async ({ page, browser, request }) => {
  const token = await signInPriya(request);
  const elder = await newElder(request, token, [{ name: "Telma", times: ["21:00"] }]);
  // Kamala's phone, in its own browser
  const phone = await (await browser.newContext()).newPage();
  const code = await (await request.post(`/api/elders/${elder.id}/pairing-code`, { headers: { Authorization: `Bearer ${token}` } })).json();
  await phone.goto("/");
  await phone.getByLabel("Code").fill(code.code);
  await phone.getByRole("button", { name: "Connect" }).click();
  await expect(phone.locator(".med-name")).toHaveText("Telma");

  await signIn(page);
  await page.goto(`/care/#/elder/${elder.id}`);
  await page.getByRole("button", { name: "Disconnect this phone" }).click();
  await page.getByRole("button", { name: "Keep it connected" }).click();       // changing your mind is safe
  await expect(page.getByText(/^✓ Connected/)).toBeVisible();
  await page.getByRole("button", { name: "Disconnect this phone" }).click();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();
  await expect(page.getByRole("button", { name: "Get a connection code" })).toBeVisible();
  await expect(page.getByText(/^✓ Connected/)).toBeHidden();

  await phone.reload();
  await expect(phone.getByText("This phone was disconnected by your family. Ask them for a new code.")).toBeVisible();
  await expect(phone.getByLabel("Code")).toBeVisible();
});

test("Priya adds a person, then removes them from her list", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Their name").fill("Ravi Kumar");
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name: "Set up Ravi Kumar" })).toBeVisible(); // the step-by-step setup opens first
  await page.locator("a.back").click();
  await expect(page.getByRole("heading", { name: "Ravi Kumar", level: 1 })).toBeVisible();
  await expect(page.getByText(/only one looking after Ravi Kumar/)).toBeVisible();

  await page.getByRole("button", { name: "Remove Ravi Kumar" }).click();
  await expect(page.getByText("This can't be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Keep Ravi Kumar" }).click();              // changing your mind is safe
  await page.getByRole("button", { name: "Remove Ravi Kumar" }).click();
  await page.getByRole("button", { name: "Yes, delete Ravi Kumar" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Ravi Kumar/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Kamala/ })).toBeVisible();          // everyone else is untouched
});

test("Adding a person opens a step-by-step setup, which says Connected by itself when their phone connects", async ({ page, request }) => {
  await signIn(page);
  await page.getByLabel("Their name").fill("Lakshmi");
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name: "Set up Lakshmi" })).toBeVisible();
  await expect(page.getByText("1 of 4 done")).toBeVisible();
  await accessible(page);

  // Step 2: the first medicine, then back to the setup
  await page.getByRole("link", { name: "Add a medicine" }).click();
  await page.getByLabel("Medicine name").fill("Telma");
  await page.getByRole("button", { name: "Add medicine" }).click();
  await expect(page.getByRole("heading", { name: "1 medicine added" })).toBeVisible();

  // Step 3: the code with step-by-step instructions, then the phone connects
  await page.getByRole("button", { name: "Get a connection code" }).click();
  await expect(page.getByText(/In the address bar at the top, type/)).toBeVisible();
  await expect(page.getByText(/Waiting for Lakshmi's phone to connect/)).toBeVisible();
  const code = (await page.locator("#setup-code-box .code").textContent()).replace(/\D/g, "");
  await request.post("/api/devices/pair", { data: { code } });
  await expect(page.getByRole("heading", { name: "Lakshmi's phone is connected" })).toBeVisible({ timeout: 10_000 }); // no reload
  await expect(page.getByText("3 of 4 done")).toBeVisible();
});
