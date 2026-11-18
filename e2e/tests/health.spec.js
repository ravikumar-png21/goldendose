// Health records: a blood report with results outside the printed range, "Doctor has seen it",
// repeating a test, and blood pressure readings with the doctor's target.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRIYA } from "./helpers.js";

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function accessible(page) {
  const results = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
}

test("A blood report, the doctor seeing it, a repeat test, and blood pressure against the doctor's target", async ({ page }) => {
  await page.goto("/care/");
  await page.getByLabel("Email").fill(PRIYA.email);
  await page.getByLabel("Password").fill(PRIYA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("link", { name: /^Health records/ }).click();
  await expect(page.getByRole("heading", { name: "Health records" })).toBeVisible();
  await expect(page.getByText("Kamala takes medicine for blood pressure").first()).toBeVisible(); // a suggestion, from her BP medicine
  await accessible(page);

  // Add a report
  await page.getByRole("link", { name: "Add a blood report" }).click();
  await page.getByLabel("Date on the report").fill("2026-10-20");
  await page.getByLabel("Lab").fill("City Diagnostics");
  await page.getByLabel("Test", { exact: true }).selectOption("hba1c");
  await expect(page.getByLabel("Unit")).toHaveValue("%");
  await page.getByLabel("Result", { exact: true }).fill("8.2");
  await page.getByLabel("Range on the report: from").fill("4");
  await page.getByLabel("to", { exact: true }).fill("5.6");
  await accessible(page);
  await page.getByRole("button", { name: "Save report" }).click();

  // It's flagged against the printed range, and stays on the list until the doctor has seen it
  await expect(page.getByRole("heading", { name: "Health records" })).toBeVisible();
  await expect(page.getByText(/1 result outside the printed range/).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Above the printed range" })).toBeVisible();
  await page.getByRole("button", { name: "Doctor has seen it" }).click();
  await expect(page.getByText("✓ Doctor has seen it")).toBeVisible();
  await expect(page.getByText(/1 result outside the printed range/)).toHaveCount(0);

  // The doctor wants it every 3 months
  await page.getByLabel("Repeat, as the doctor said:").selectOption("3");
  await expect(page.getByText(/Next test due by/)).toBeVisible();

  // Blood pressure, with the doctor's target
  await page.getByLabel("Remind me to check blood pressure").selectOption("7");
  await page.getByLabel("Doctor's target: top").fill("140");
  await page.getByLabel("bottom", { exact: true }).fill("90");
  await page.locator("#bp-settings").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("No blood pressure reading yet")).toBeVisible();
  await page.getByLabel("Top number").fill("162");
  await page.getByLabel("Bottom number").fill("95");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByText(/Latest: 162\/95 .* above the doctor's target/)).toBeVisible();
  await expect(page.getByText("Latest BP 162/95 is above the doctor's target")).toBeVisible();
  await accessible(page);
});

test("Questions for the doctor, weight and sugar logs, and booking a home collection with the family's lab", async ({ page }) => {
  await page.goto("/care/");
  await page.getByLabel("Email").fill(PRIYA.email);
  await page.getByLabel("Password").fill(PRIYA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /^Kamala/ }).click();
  await page.getByRole("link", { name: /^Health records/ }).click();

  await page.getByLabel("New question").fill("Can the evening Metformin be taken with dinner?");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Can the evening Metformin be taken with dinner?")).toBeVisible();
  await page.getByRole("button", { name: "Answered" }).click();
  await page.getByLabel("What the doctor said (optional)").fill("Yes, with dinner");
  await page.locator("[data-answer-form]").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("No questions yet.")).toBeVisible();

  await page.getByLabel("Weight (kg)").fill("58.5");
  await page.getByLabel("Remind me to weigh").selectOption("7");
  await page.locator("#weight-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Latest: 58\.5 kg/)).toBeVisible();

  await page.getByLabel("Sugar (mg/dL)").fill("148");
  await page.getByLabel("When", { exact: true }).selectOption("fasting");
  await page.locator("#sugar-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Latest: 148 mg\/dL \(fasting\)/)).toBeVisible();

  // The lab, and a test the doctor wants repeated, make the booking button appear
  await page.getByLabel("Lab name").fill("City Diagnostics");
  await page.getByLabel("Lab's WhatsApp number").fill("+91 98450 22222");
  await page.locator("#lab-settings").getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Add a blood report" }).click();
  await page.getByLabel("Test", { exact: true }).selectOption("hba1c");
  await page.getByLabel("Result", { exact: true }).fill("7.1");
  await page.getByRole("button", { name: "Save report" }).click();
  await page.getByLabel("Repeat, as the doctor said:").first().selectOption("3");
  const book = page.getByRole("link", { name: /^Book a home collection/ });
  await expect(book).toHaveAttribute("href", /^https:\/\/wa\.me\/919845022222\?text=Namaste%20City%20Diagnostics.*HbA1c/);
  await accessible(page);
});
