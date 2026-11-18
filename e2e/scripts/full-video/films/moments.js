// Film: short real-app moments for the Why part and the ending.
//   wm-connected   Priya's setup turns to Connected by itself as Kamala's phone connects
//   wm-alarm       the alarm fills Kamala's screen, reads the pill out, and she taps Taken
//   close-elder    Kamala's green card: taken, with the time
//   close-family   Priya's phone, far away, shows it too
// A brand-new account on the test backend, set up behind the scenes, so it looks like a real first day.
import { sleep, hhmmFromNow, api } from "../../lib.js";
import { openStage } from "../stage.js";

// Test values for the local test backend only.
const PRIYA = { name: "Priya", phone: "+91 98765 43210", email: "priya.moments@example.com", password: "moments-demo" };

export default async function film() {
  // Behind the scenes: Priya's account, Kamala, and Calcium due now (so the alarm rings once her phone connects)
  const { token } = await api("POST", "/api/auth/signup", null, PRIYA);
  const kamala = await api("POST", "/api/elders", token, { name: "Kamala", timezone: "Asia/Kolkata" });
  await api("POST", `/api/elders/${kamala.id}/medicines`, token, {
    name: "Calcium", strength: "500 mg", instruction: "Take one orange tablet with water", purpose: "Bone strength",
    pillShape: "oval", pillColor: "#F29B4E", times: [hhmmFromNow(0)],
  });
  const { code } = await api("POST", `/api/elders/${kamala.id}/pairing-code`, token);

  const { family, elder, familyFrame, elderFrame, point, unpoint, tap, scene, untilWordsLeft, startFilming, finish } =
    await openStage("moments", "GoldenDose");

  // Priya signs in and opens Kamala's setup, before filming starts
  await family.getByLabel("Email").fill(PRIYA.email);
  await family.getByLabel("Password").fill(PRIYA.password);
  await family.getByRole("button", { name: "Sign in" }).click();
  await family.getByRole("heading", { name: "Hello, Priya" }).waitFor();
  await familyFrame().evaluate((id) => { location.hash = `#/elder/${id}/setup`; }, kamala.id);
  await family.getByRole("heading", { name: "Set up Kamala" }).waitFor();
  await startFilming();

  await scene("wm-connected", async () => {
    await sleep(1500);
    // Meanwhile, on Kamala's phone (not shown on screen): the code goes in and Connect is pressed
    await elderFrame().evaluate((code) => {
      document.getElementById("pair-code").value = code;
      document.getElementById("pair-form").requestSubmit();
    }, code);
    const connected = family.getByRole("heading", { name: "Kamala's phone is connected" });
    await connected.waitFor({ timeout: 15_000 });
    await connected.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(300);
    await point(connected, 2500);
    await unpoint(connected);
  });

  await scene("wm-alarm", async () => {
    const alarm = elder.getByRole("alertdialog");
    await alarm.waitFor();
    // The phone was connected without a tap, so its browser still needs one tap to allow sound:
    // tapping anywhere on the alarm does that (here, its clock), and the note changes to "Ringing".
    await elder.locator("#alarm-clock").click();
    await untilWordsLeft(3);
    const taken = alarm.getByRole("button", { name: "Taken" });
    await point(taken, 600);
    await untilWordsLeft(0.8);
    await tap(taken, 200);
  }, { lead: ["ring", "read-calcium"] });

  await scene("close-elder", async () => {
    const card = elder.locator(".card", { hasText: "Calcium" });
    await card.getByText(/Taken at/).waitFor({ timeout: 10_000 });
    await sleep(1200);
    await point(card, 3500);
    await unpoint(card);
  });

  await scene("close-family", async () => {
    await familyFrame().evaluate((id) => { location.hash = `#/elder/${id}`; }, kamala.id);
    const row = family.locator(".dose-row", { hasText: "Calcium" });
    await row.getByText(/Taken/).waitFor({ timeout: 10_000 });
    await sleep(800);
    await point(row, 4000);
  });

  await finish();
}
