// Accessibility checks with axe, the industry-standard checker.
// It scans each screen for problems that affect people using screen readers, zoom, keyboards,
// or with low vision. Kamala's screens are held to the strictest level (WCAG AAA, including 7:1 contrast).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInPriya, newElder, openPairedElderApp, hhmmFromNow, PRIYA } from "./helpers.js";

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const STRICTEST = [...STANDARD, "wcag2aaa"];

// Lists any problems in plain words if a check fails.
async function check(page, tags) {
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
}

test("Kamala's pairing screen (strictest level)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Code")).toBeVisible();
  await check(page, STRICTEST);
});

test("Kamala's Today screen and alarm (strictest level)", async ({ page, request }) => {
  const token = await signInPriya(request);
  const elder = await newElder(request, token, [
    { name: "Due Pill", instruction: "Take one white tablet", times: [hhmmFromNow(0)] },
    { name: "Later Pill", times: [hhmmFromNow(150)] },
  ]);
  await openPairedElderApp(page, request, token, elder.id);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await check(page, STRICTEST);                      // with the alarm showing

  await page.getByRole("alertdialog").getByRole("button", { name: "Taken" }).click();
  await expect(page.getByText("Well done")).toBeHidden({ timeout: 5000 });
  await check(page, STRICTEST);                      // the Today list with taken, due and later cards
});

test("Caregiver screens (standard level)", async ({ page }) => {
  await page.goto("/care/");
  await check(page, STANDARD);                       // sign in

  await page.getByLabel("Email").fill(PRIYA.email);
  await page.getByLabel("Password").fill(PRIYA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
  await check(page, STANDARD);                       // people

  await page.getByRole("link", { name: /^Kamala/ }).click();
  await expect(page.getByRole("heading", { name: "Kamala", level: 1 })).toBeVisible();
  await check(page, STANDARD);                       // one person

  await page.getByRole("link", { name: "Add a medicine" }).click();
  await expect(page.getByLabel("Medicine name")).toBeVisible();
  await check(page, STANDARD);                       // medicine form

  await page.goBack();
  await page.getByRole("link", { name: "Last 7 days", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Last 7 days" })).toBeVisible();
  await check(page, STANDARD);                       // history
});
