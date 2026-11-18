// My account: changing the password and signing out everywhere, the way a family member would.
import { test, expect } from "@playwright/test";

const ASHA = { name: "Asha", email: "asha@example.com", password: "ashas-first-password" };
const NEW_PASSWORD = "ashas-second-password";

async function signIn(page, password) {
  await page.goto("/care/#/signin");
  await page.getByLabel("Email").fill(ASHA.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("My account: change the password, then sign out everywhere", async ({ page, request }) => {
  expect((await request.post("/api/auth/signup", { data: ASHA })).status()).toBe(201);
  await signIn(page, ASHA.password);
  await expect(page.getByRole("heading", { name: "Hello, Asha" })).toBeVisible();

  await page.getByRole("link", { name: /My account/ }).click();
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();

  // A wrong current password is refused with a clear message
  await page.getByLabel("Current password").fill("not-my-password");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").first()).toHaveText("Your current password is wrong.");

  // The right one changes it
  await page.getByLabel("Current password").fill(ASHA.password);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");

  // Sign out everywhere goes back to the sign-in screen
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // The old password no longer works; the new one does
  await signIn(page, ASHA.password);
  await expect(page.getByRole("alert")).toHaveText("Email or password is wrong.");
  await signIn(page, NEW_PASSWORD);
  await expect(page.getByRole("heading", { name: "Hello, Asha" })).toBeVisible();
});
