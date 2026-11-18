// Kamala's app, tested the way she'd use it. Each test names the requirement it proves (docs/TEST-PLAN.md).
import { test, expect } from "@playwright/test";
import { signInPriya, newElder, openPairedElderApp, hhmmFromNow, minutesLeftToday, pause } from "./helpers.js";

let token;
test.beforeAll(async ({ request }) => { token = await signInPriya(request); });

test("Pairing: a wrong code shows a clear message, not a crash", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Code").fill("123");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("alert")).toHaveText("Type all 6 numbers of the code.");

  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("alert")).toContainText("That code didn't work");
});

test("E1: Today lists medicines in time order and remembers the phone after closing", async ({ page, request }) => {
  test.skip(minutesLeftToday() < 50, "needs both times to fall before midnight");
  const elder = await newElder(request, token, [
    { name: "Evening Pill", times: [hhmmFromNow(40)] },
    { name: "Soon Pill", times: [hhmmFromNow(20)] },
  ]);
  await openPairedElderApp(page, request, token, elder.id);
  const names = page.locator(".med-name");
  await expect(names).toHaveText(["Soon Pill", "Evening Pill"]);

  await page.reload(); // like closing and reopening the app
  await expect(names).toHaveText(["Soon Pill", "Evening Pill"]);
});

test("E5, E2, E3: the alarm rings when due, and Taken shows a green tick with the time", async ({ page, request }) => {
  const elder = await newElder(request, token, [
    { name: "Amlodipine", strength: "5 mg", instruction: "Take one pink tablet", times: [hhmmFromNow(0)] },
  ]);
  await openPairedElderApp(page, request, token, elder.id);

  const alarm = page.getByRole("alertdialog");
  await expect(alarm).toBeVisible();
  await expect(alarm).toContainText("Amlodipine 5 mg");
  await expect(alarm).toContainText("Take one pink tablet");

  await alarm.getByRole("button", { name: "Taken" }).click();
  await expect(page.getByText("Well done")).toBeVisible();
  await expect(alarm).toBeHidden();
  await expect(page.locator(".card-taken .status")).toContainText(/Taken at \d{1,2}:\d{2} (am|pm)/);
  await expect(page.locator("#progress")).toContainText("1 of 1 medicines taken today");
});

test("E4: Undo puts the dose back, and the alarm doesn't instantly ring again", async ({ page, request }) => {
  const elder = await newElder(request, token, [{ name: "Metformin", times: [hhmmFromNow(0)] }]);
  await openPairedElderApp(page, request, token, elder.id);

  await page.getByRole("alertdialog").getByRole("button", { name: "Taken" }).click();
  await expect(page.locator(".card-taken")).toBeVisible();
  await pause(page);
  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.locator(".status")).toHaveText("Due now");
  await expect(page.getByRole("button", { name: "Taken" })).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("Skip: skipping from the alarm is recorded and shown calmly", async ({ page, request }) => {
  const elder = await newElder(request, token, [{ name: "Vitamin D3", times: [hhmmFromNow(0)] }]);
  await openPairedElderApp(page, request, token, elder.id);
  await page.getByRole("alertdialog").getByRole("button", { name: "Skip this dose" }).click();
  await expect(page.locator(".card-skipped .status")).toContainText("Skipped at");
});

test("Journey 2: a dose more than an hour away can't be marked by mistake", async ({ page, request }) => {
  test.skip(minutesLeftToday() < 75, "needs a time more than an hour away but before midnight");
  const elder = await newElder(request, token, [{ name: "Bedtime Pill", times: [hhmmFromNow(70)] }]);
  await openPairedElderApp(page, request, token, elder.id);
  await expect(page.locator(".card-later .status")).toHaveText("Later today");
  await expect(page.getByRole("button", { name: "Taken" })).toHaveCount(0);
});

test("Journey 3: a late dose says 'Not taken yet' gently, never 'missed'", async ({ page, request }) => {
  test.skip(new Date().getHours() < 1, "needs a time at least 45 minutes after midnight");
  const elder = await newElder(request, token, [{ name: "Late Pill", times: [hhmmFromNow(-45)] }]);
  await openPairedElderApp(page, request, token, elder.id);
  await expect(page.locator(".card-not-taken .status")).toContainText("Not taken yet");
  await expect(page.locator("body")).not.toContainText(/missed/i);
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("Reliability: a tap made without internet is kept and sent when the internet returns", async ({ page, request, context }) => {
  const elder = await newElder(request, token, [{ name: "Offline Pill", times: [hhmmFromNow(0)] }]);
  await openPairedElderApp(page, request, token, elder.id);

  await context.setOffline(true);
  await page.getByRole("alertdialog").getByRole("button", { name: "Taken" }).click();
  await expect(page.locator("#notice")).toContainText("Your tap is saved");
  await expect(page.locator(".card-taken")).toBeVisible();      // Kamala sees it as done straight away
  await expect(page.getByText("No internet right now. Reminders still work.")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("No internet right now. Reminders still work.")).toBeHidden({ timeout: 10_000 });

  // The caregiver's history proves the backend received it.
  const today = hhmmFromNow(0) && new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const history = await (await request.get(`/api/elders/${elder.id}/history?from=${today}&to=${today}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  expect(history.map((d) => d.status)).toEqual(["taken"]);
});

test("Design rule: main buttons are at least 72px tall, other buttons at least 64px", async ({ page, request }) => {
  const elder = await newElder(request, token, [{ name: "Size Pill", times: [hhmmFromNow(0)] }]);
  await openPairedElderApp(page, request, token, elder.id);
  const alarm = page.getByRole("alertdialog");
  expect((await alarm.getByRole("button", { name: "Taken" }).boundingBox()).height).toBeGreaterThanOrEqual(72);
  expect((await alarm.getByRole("button", { name: "Skip this dose" }).boundingBox()).height).toBeGreaterThanOrEqual(64);

  await alarm.getByRole("button", { name: "Taken" }).click();
  await expect(page.getByText("Well done")).toBeHidden({ timeout: 5000 });
  expect((await page.getByRole("button", { name: "Undo" }).boundingBox()).height).toBeGreaterThanOrEqual(64);
});

test("Design rule: on a short screen the alarm still shows the full pill picture", async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 500 });
  const elder = await newElder(request, token, [{ name: "Short Screen Pill", instruction: "Take one orange tablet with water", times: [hhmmFromNow(0)] }]);
  await openPairedElderApp(page, request, token, elder.id);
  const picture = await page.locator("#alarm-pill").boundingBox();
  expect(picture.height).toBeGreaterThanOrEqual(120);
});

test("Design rule: nothing is cut off or scrolls sideways on a small phone (320px wide)", async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const elder = await newElder(request, token, [{ name: "Hydrochlorothiazide", strength: "12.5 mg", instruction: "Take one small white tablet in the morning with water", times: [hhmmFromNow(90)] }]);
  await openPairedElderApp(page, request, token, elder.id);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
