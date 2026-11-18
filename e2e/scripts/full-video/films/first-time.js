// Film: the first-time tour. Priya creates an account and sets everything up, then Kamala's first day.
// Uses a brand-new account on the test backend, so it starts from nothing, like a real first time.
import { sleep, hhmmFromNow } from "../../lib.js";
import { openStage } from "../stage.js";

// Test values for the local test backend only.
const PRIYA = { name: "Priya", phone: "+91 98765 43210", email: "priya.first@example.com", password: "first-time-demo" };

export default async function film() {
  const { family, elder, familyFrame, point, unpoint, tap, type, scene, sound, untilWordsLeft, startFilming, finish } =
    await openStage("first-time", "GoldenDose · first time");
  await startFilming();

  // ---------- Priya ----------
  let code = "";
  let medicineTime = "";
  await scene("ft03", async () => {
    await tap(family.getByRole("link", { name: "Create an account" }));
    await type(family.getByLabel("Your name"), PRIYA.name);
    await type(family.getByLabel("Mobile number"), PRIYA.phone);
    await type(family.getByLabel("Email"), PRIYA.email);
    await type(family.getByLabel("Password"), PRIYA.password);
    await untilWordsLeft(3.5);
    await tap(family.getByRole("button", { name: "Create account" }));
    await family.getByRole("heading", { name: "Hello, Priya" }).waitFor();
  });

  await scene("ft04", async () => {
    await type(family.getByLabel("Their name"), "Kamala");
    await untilWordsLeft(1.5);
    await tap(family.getByRole("button", { name: "Add person" }));
    await family.getByRole("heading", { name: "Set up Kamala" }).waitFor(); // Kamala's setup, step by step
  });

  await scene("ft05", async () => {
    await sleep(1200);
    await tap(family.getByRole("link", { name: "Add a medicine" }).first());
    await type(family.getByLabel("Medicine name"), "Calcium");
    await type(family.getByLabel("Strength"), "500 mg");
    await type(family.getByLabel("Instruction"), "Take one orange tablet with water");
    await type(family.getByLabel("What it's for"), "Bone strength");
  });

  await scene("ft06", async () => {
    // The time is "now", so the alarm rings on Kamala's phone as soon as it's connected.
    medicineTime = hhmmFromNow(0);
    const time = family.getByLabel("Time").first();
    await point(time, 900);
    await time.fill(medicineTime);
    await unpoint(time);
    await tap(family.getByRole("radio", { name: "Oval" }));
    await tap(family.getByRole("radio", { name: "Orange" }).first());
    await point(family.getByText("Take or choose a photo"), 1000);
    await unpoint(family.getByText("Take or choose a photo"));
    await untilWordsLeft(1.5);
    await tap(family.getByRole("button", { name: "Add medicine" }));
    await family.getByRole("heading", { name: "1 medicine added" }).waitFor(); // back to the setup
  });

  await scene("ft07", async () => {
    await sleep(800);
    await tap(family.getByRole("button", { name: "Get a connection code" }));
    await family.locator(".code").waitFor();
    code = (await family.locator(".code").textContent()).replace(/\D/g, "");
    await point(family.locator(".code"), 1500);
  });

  await scene("ft08", async () => {
    await unpoint(family.locator(".code"));
    await tap(family.getByRole("link", { name: "Change how I'm told" }));
    for (const name of ["SMS", "WhatsApp", "App notification"]) {
      const box = family.getByLabel(name);
      await point(box, 700);
      await unpoint(box);
    }
    await untilWordsLeft(2.5);
    await tap(family.getByRole("button", { name: "Save" }));
    await sleep(600);
    await familyFrame().evaluate(() => history.back()); // back to Kamala's setup, which waits for her phone
    await family.getByRole("heading", { name: "Set up Kamala" }).waitFor();
  });

  // ---------- Kamala ----------
  await scene("ft10", async () => {
    await type(elder.getByLabel("Code"), code);
    await untilWordsLeft(0.6);
    await tap(elder.getByRole("button", { name: "Connect" }));
  });

  // Priya's setup turns to Connected by itself, a moment later
  await scene("ft10b", async () => {
    const connected = family.getByRole("heading", { name: "Kamala's phone is connected" });
    await connected.waitFor({ timeout: 15_000 });
    await connected.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(400);
    await point(connected, 2500);
    await unpoint(connected);
  });

  // The alarm rings and the phone reads the medicine out, as it really does; then Bella explains.
  await scene("ft11", async () => {
    const alarm = elder.getByRole("alertdialog");
    await alarm.waitFor();
    await untilWordsLeft(4);
    const taken = alarm.getByRole("button", { name: "Taken" });
    await point(taken, 600);
    await untilWordsLeft(0.6);
    await tap(taken, 200);
  }, { lead: ["ring", "read-calcium"] });

  await scene("ft12", async () => {});

  await scene("ft13", async () => {
    const readAloud = elder.getByRole("button", { name: "Read aloud" }).first();
    await untilWordsLeft(1.5);
    await point(readAloud, 100);
    await untilWordsLeft(-0.2); // Bella has finished
    await tap(readAloud, 100);
    await sound("read-calcium"); // the phone speaks
  });

  await scene("ft14", async () => {
    const card = elder.locator(".card", { hasText: "Calcium" });
    await sleep(1500);
    await point(card.getByText(/Taken at/), 4000);
    await unpoint(card.getByText(/Taken at/));
  });

  // ---------- Back to Priya ----------
  await scene("ft15", async () => {
    await familyFrame().evaluate(() => { location.hash = location.hash.replace(/\/(settings|setup)$/, ""); });
    await family.locator(".dose-row", { hasText: "Calcium" }).waitFor();
    await sleep(800);
    await point(family.locator(".dose-row", { hasText: "Calcium" }), 3000);
  });

  await finish();
}
