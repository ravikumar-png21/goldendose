// Film: more things you can do. Everything on the click-by-click slides that the first-time tour doesn't show:
// Skip, the next alarm, Undo, Taken from the card, signing in again, the people list, today's colours,
// history, changing (add and remove a time) and stopping a medicine, inviting family, All people, signing out.
// Uses the demo account (Priya, with Kamala's medicines and history), set up off camera first.
import { api, sleep, signInPriya, kamalaOf, clearDueDoses, hhmmFromNow } from "../../lib.js";
import { openStage } from "../stage.js";

// Test values for the local test backend only.
const PRIYA = { email: "priya@example.com", password: "goldendose-demo" };
const MEERA = { name: "Meera Iyer", email: "meera@example.com", password: "goldendose-demo" };

export default async function film() {
  const { family, elder, familyFrame, point, unpoint, tap, type, show, scene, sound, untilWordsLeft, startFilming, finish } =
    await openStage("more", "GoldenDose · more things you can do");

  // ---------- Off camera: get both phones ready ----------
  const token = await signInPriya();
  const kamala = await kamalaOf(token);
  await clearDueDoses(token, kamala.id); // only the medicines added below will ring
  await api("POST", "/api/auth/signup", null, MEERA);
  const addMedicine = (name, strength, instruction, pillColor) => api("POST", `/api/elders/${kamala.id}/medicines`, token, {
    name, strength, instruction, pillShape: "round", pillColor, times: [hhmmFromNow(0)],
  });
  // Two medicines due now, so the second alarm follows the first
  await addMedicine("Iron", "65 mg", "Take one red tablet after lunch", "#D9534F");
  await addMedicine("Folic acid", "5 mg", "Take one small yellow tablet", "#F2C14E");
  // Kamala's phone: connected, with the first alarm ringing. Priya's phone stays on the Sign in screen.
  await show("elder");
  const { code } = await api("POST", `/api/elders/${kamala.id}/pairing-code`, token);
  await elder.getByLabel("Code").fill(code);
  await elder.getByRole("button", { name: "Connect" }).click();
  await elder.getByRole("alertdialog").waitFor({ timeout: 15_000 });

  await startFilming();

  // ---------- Kamala ----------
  const alarm = elder.getByRole("alertdialog");
  const firstName = (await alarm.locator("#alarm-name").textContent()).split(" ")[0]; // "Iron" or "Folic"
  const secondName = firstName === "Iron" ? "Folic acid" : "Iron";

  await scene("mt02", async () => {
    const skip = alarm.getByRole("button", { name: "Skip this dose" });
    await untilWordsLeft(3);
    await point(skip, 1500);
    await untilWordsLeft(0.3);
    await tap(skip, 200);
  }, { lead: ["ring"] });

  // The next alarm, straight after: it rings, then Bella explains.
  await scene("mt02b", async () => {
    await alarm.getByText(secondName).waitFor();
    await untilWordsLeft(4);
    await point(alarm.getByText(secondName), 3000);
    await unpoint(alarm.getByText(secondName));
  }, { lead: ["ring"] });

  const secondCard = elder.locator(".card", { hasText: secondName });
  await scene("mt03", async () => {
    await tap(alarm.getByRole("button", { name: "Taken" }), 900);
    await sleep(3200); // "Well done", then back to Today
    await tap(secondCard.getByRole("button", { name: "Undo" }), 1200);
    await sleep(800);
    await point(secondCard, 2000);
    await unpoint(secondCard);
  });

  await scene("mt04", async () => {
    await sleep(1500);
    await untilWordsLeft(2);
    await tap(secondCard.getByRole("button", { name: "Taken" }), 1200);
  });

  // ---------- Priya ----------
  await scene("mt05", async () => {
    // A medicine due now, so Kamala's page has a yellow "Due now" too (her phone isn't on camera any more).
    await addMedicine("Vitamin B12", "1500 mcg", "Take one small pink tablet after breakfast", "#F4A7B9");
    await type(family.getByLabel("Email"), PRIYA.email);
    await type(family.getByLabel("Password"), "wrong-password");
    await tap(family.getByRole("button", { name: "Sign in" }), 500);
    const error = family.getByText(/Email or password is wrong/);
    await error.waitFor();
    await point(error, 1800);
    await unpoint(error);
    await family.getByLabel("Password").fill("");
    await type(family.getByLabel("Password"), PRIYA.password);
    await untilWordsLeft(1.5);
    await tap(family.getByRole("button", { name: "Sign in" }), 500);
    await family.getByRole("heading", { name: /Hello, Priya/ }).waitFor();
  });

  await scene("mt06", async () => {
    await sleep(1000);
    await point(family.getByRole("link", { name: /^Kamala/ }), 1500);
    await unpoint(family.getByRole("link", { name: /^Kamala/ }));
    await point(family.getByRole("link", { name: /^Ramesh/ }), 1500);
    await unpoint(family.getByRole("link", { name: /^Ramesh/ }));
    await untilWordsLeft(1.5);
    await tap(family.getByRole("link", { name: /^Kamala/ }), 600);
    await family.getByRole("heading", { name: "Kamala", exact: true }).waitFor();
  });

  await scene("mt07", async () => {
    // Point at one dose of each colour, as Bella names them.
    for (const chip of ["chip-taken", "chip-skipped", "chip-missed", "chip-due", "chip-upcoming"]) {
      const row = family.locator(".dose-row", { has: family.locator(`.${chip}`) }).first();
      if (await row.count()) {
        await point(row, 1500);
        await unpoint(row);
      } else {
        await sleep(1500); // none of that colour at this time of day
      }
    }
  });

  await scene("mt08", async () => {
    await familyFrame().evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(600);
    await tap(family.getByRole("link", { name: "Last 7 days", exact: true }));
    await sleep(1800);
    for (const y of [350, 700]) {
      await familyFrame().evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);
      await sleep(1800);
    }
  });

  await scene("mt09", async () => {
    await tap(family.locator("a.back"), 500);
    await family.getByRole("heading", { name: "Kamala", exact: true }).waitFor();
    await tap(family.getByRole("link", { name: /^Amlodipine/ }));
    await tap(family.getByRole("button", { name: "Add another time" }));
    const second = family.getByLabel("Time").nth(1);
    await point(second, 500);
    await second.fill("21:00");
    await sleep(500);
    await unpoint(second);
    await tap(family.getByRole("button", { name: "Add another time" }), 500);
    await sleep(700);
    await tap(family.getByRole("button", { name: "Remove" }).last());
    await untilWordsLeft(4.5);
    await tap(family.getByRole("button", { name: "Save changes" }));
    await family.getByRole("heading", { name: "Kamala", exact: true }).waitFor();
  });

  await scene("mt10", async () => {
    await tap(family.getByRole("link", { name: /^Atorvastatin/ }));
    await tap(family.getByRole("button", { name: "Stop Atorvastatin" }));
    await point(family.getByRole("button", { name: "Keep it" }), 1200);
    await unpoint(family.getByRole("button", { name: "Keep it" }));
    await untilWordsLeft(3);
    await tap(family.getByRole("button", { name: "Yes, stop it" }));
    await family.getByRole("heading", { name: "Kamala", exact: true }).waitFor();
  });

  await scene("mt11", async () => {
    await tap(family.getByRole("link", { name: /How you're told about missed doses/ }));
    for (const name of ["SMS", "WhatsApp", "App notification"]) {
      await point(family.getByLabel(name), 500);
      await unpoint(family.getByLabel(name));
    }
    await type(family.getByLabel("Their email"), MEERA.email);
    await sleep(2500); // "Meera needs her own GoldenDose account first"
    await point(family.getByLabel("What can they do?"), 5500);
    await unpoint(family.getByLabel("What can they do?"));
    await untilWordsLeft(1.2);
    await tap(family.getByRole("button", { name: "Invite" }), 500);
    await point(family.getByText(/can now see/), 1500);
  });

  await scene("mt12", async () => {
    await unpoint(family.getByText(/can now see/));
    await familyFrame().evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(700);
    await tap(family.locator("a.back"), 500); // back to Kamala
    await family.getByRole("heading", { name: "Kamala", exact: true }).waitFor();
    await tap(family.getByRole("link", { name: "All people" }));
    await family.getByRole("heading", { name: /Hello, Priya/ }).waitFor();
    await untilWordsLeft(3.5);
    await tap(family.getByRole("button", { name: "Sign out" }));
    await family.getByRole("heading", { name: "Sign in" }).waitFor();
  });

  await finish();
}
