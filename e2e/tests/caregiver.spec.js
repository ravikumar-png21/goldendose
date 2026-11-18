// The caregiver app, tested the way Priya would use it.
import { test, expect } from "@playwright/test";
import { PRIYA } from "./helpers.js";

async function signIn(page) {
  await page.goto("/care/");
  await page.getByLabel("Email").fill(PRIYA.email);
  await page.getByLabel("Password").fill(PRIYA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
}

test("Sign in: a wrong password gets a clear, safe message", async ({ page }) => {
  await page.goto("/care/");
  await page.getByLabel("Email").fill(PRIYA.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Email or password is wrong.");
});

test("C5: Priya sees everyone she looks after, and stays signed in after a reload", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("link", { name: /^Kamala/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Ramesh/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
});

test("C1: adding a medicine checks the form, then shows it in today's list", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("link", { name: "Add a medicine" }).click();

  await page.getByRole("button", { name: "Add medicine" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter the medicine name.");

  await page.getByLabel("Medicine name").fill("Levothyroxine");
  await page.getByLabel("Strength").fill("50 mcg");
  await page.getByLabel("Instruction").fill("Take one small white tablet before breakfast");
  await page.getByLabel("Time").first().fill("06:30");
  await page.getByRole("button", { name: "Add another time" }).click();
  await page.getByLabel("Time").nth(1).fill("18:30");
  await page.getByRole("radio", { name: "Capsule" }).check();
  await expect(page.getByText("Second colour of the capsule")).toBeVisible();
  await page.getByRole("button", { name: "Add medicine" }).click();

  await expect(page.getByRole("heading", { name: "Kamala", level: 1 })).toBeVisible();
  await expect(page.locator(".dose-row", { hasText: "Levothyroxine" })).toHaveCount(2);
});

test("C1: stopping a medicine asks first, then removes it from the list", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /^Ramesh/ }).click();
  await page.getByRole("link", { name: /^Telmisartan/ }).click();
  await page.getByRole("button", { name: "Stop Telmisartan" }).click();
  await expect(page.getByText("Stop Telmisartan?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, stop it" }).click();
  await expect(page.getByRole("heading", { name: "Ramesh", level: 1 })).toBeVisible();
  await expect(page.locator(".dose-row", { hasText: "Telmisartan" })).toHaveCount(0);
});

test("Pairing: Priya gets a 6-digit code to connect Kamala's phone", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("button", { name: "Get a connection code" }).click();
  await expect(page.locator(".code")).toHaveText(/^\d{3} \d{3}$/);
});

test("C4: history shows the last 7 days, including yesterday's missed dose", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("link", { name: "Last 7 days", exact: true }).click();
  const yesterday = page.locator(".day", { has: page.getByRole("heading", { name: "Yesterday" }) });
  await expect(yesterday.locator(".dose-row", { hasText: "Vitamin D3" })).toContainText("Missed");
  await expect(page.locator(".day")).toHaveCount(7);
});

test("C7: Priya changes how she's alerted, and the choice is saved", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("link", { name: /How you're told/ }).click();
  await page.getByLabel("SMS").uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("SMS")).not.toBeChecked();
  await expect(page.getByLabel("WhatsApp")).toBeChecked();
});

test("C6: inviting someone without an account explains what to do", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("link", { name: /How you're told/ }).click();
  await page.getByLabel("Their email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "sign up" })).toContainText("Ask them to sign up first");
});

test("A new family member can create an account", async ({ page }) => {
  await page.goto("/care/#/signup");
  await page.getByLabel("Your name").fill("Meera Iyer");
  await page.getByLabel("Email").fill(`meera.${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Meera" })).toBeVisible();
  await expect(page.getByText("Add the first person you look after")).toBeVisible();
});
