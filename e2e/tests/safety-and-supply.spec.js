// The emergency button, Kamala's language, and the medicine meter with a WhatsApp order to the chemist.
import { test, expect } from "@playwright/test";
import { PRIYA, signInPriya, newElder, openPairedElderApp, pause } from "./helpers.js";

let token;
test.beforeAll(async ({ request }) => { token = await signInPriya(request); });

const auth = () => ({ Authorization: `Bearer ${token}` });

async function setProfile(request, elderId, profile) {
  const reply = await request.put(`/api/elders/${elderId}/profile`, { headers: auth(), data: profile });
  expect(reply.status()).toBe(200);
}

test("Language: the family chooses Hindi, and Kamala's app shows Hindi", async ({ page, request }) => {
  const elder = await newElder(request, token, [{ name: "Telma", strength: "40", times: ["08:00"] }]);
  await setProfile(request, elder.id, { language: "hi" });
  await openPairedElderApp(page, request, token, elder.id);

  await expect(page.getByRole("button", { name: "इमरजेंसी" })).toBeVisible();
  await expect(page.getByRole("button", { name: "पढ़कर सुनाएँ" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  // The medicine name stays exactly as the family typed it.
  await expect(page.locator(".med-name")).toHaveText("Telma");
});

test("Emergency: one tap tells the family and offers to call the ambulance and their hospital", async ({ page, request }) => {
  const elder = await newElder(request, token, [{ name: "Telma", times: ["08:00"] }]);
  await setProfile(request, elder.id, { hospital: { name: "City Hospital", phone: "+91 80 2222 3333" } });
  await openPairedElderApp(page, request, token, elder.id);

  await page.getByRole("button", { name: "Emergency" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "family" })).toHaveText("Your family has been told.");
  await expect(page.getByRole("link", { name: "Call ambulance 108" })).toHaveAttribute("href", "tel:108");
  await expect(page.getByRole("link", { name: "Call City Hospital" })).toHaveAttribute("href", "tel:+918022223333");

  const pressed = await (await request.get(`/api/elders/${elder.id}/emergencies`, { headers: auth() })).json();
  expect(pressed).toHaveLength(1);

  await pause(page); // the app ignores a second tap within 0.8 seconds, like a person's accidental double tap
  await page.getByRole("button", { name: "I'm OK" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect.poll(async () =>
    (await (await request.get(`/api/elders/${elder.id}/emergencies`, { headers: auth() })).json())[0].cancelledAt,
  ).toBeTruthy();
});

test("Medicine meter: 4 days of tablets left shows Running low, with a ready WhatsApp order", async ({ page, request }) => {
  const elder = await newElder(request, token, [{ name: "Telma", strength: "40", times: ["08:00"] }]);
  await setProfile(request, elder.id, { chemist: { name: "Sharma Medical", phone: "+91 98450 11111" } });
  const medicines = await (await request.get(`/api/elders/${elder.id}/medicines`, { headers: auth() })).json();
  await request.put(`/api/medicines/${medicines[0].id}/stock`, { headers: auth(), data: { tabletsLeft: 4, perDose: 1 } });

  await page.goto("/care/");
  await page.getByLabel("Email").fill(PRIYA.email);
  await page.getByLabel("Password").fill(PRIYA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
  await page.goto(`/care/#/elder/${elder.id}`);

  await expect(page.getByRole("heading", { name: "Running low" })).toBeVisible();
  await expect(page.locator(".running-low")).toContainText("About 4 days left");
  const order = page.getByRole("link", { name: "Order on WhatsApp from Sharma Medical" });
  const href = new URL(await order.getAttribute("href"));
  expect(href.origin + href.pathname).toBe("https://wa.me/919845011111");
  expect(href.searchParams.get("text")).toContain("Telma 40: 30 tablets (1 month)");
});

test("Emergency: the very first tap after the app reloads still reaches the button", async ({ page, request }) => {
  // After a reload, the "switch on the alarm sound" bar is back. It must not vanish under the finger
  // and shift the screen, or the tap lands on something else.
  const elder = await newElder(request, token, [{ name: "Telma", times: ["08:00"] }]);
  await openPairedElderApp(page, request, token, elder.id);
  await page.reload();
  await expect(page.getByRole("button", { name: /switch on the alarm sound/ })).toBeVisible();
  await page.getByRole("button", { name: "Emergency" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
});
