// A guided tour of the API. Start the backend first (npm start), then in another terminal:
//   npm run tour
//
// It plays the story from docs/UX-FLOWS.md with real requests and shows every reply.

const BASE = process.env.API ?? "http://localhost:3000";
let stepNumber = 0;

async function call(method, path, { token, body } = {}) {
  console.log(`   → ${method} ${path}${body ? `  ${JSON.stringify(body)}` : ""}${token ? "   (with token)" : ""}`);
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const shown = data === null ? "(no body)" : JSON.stringify(data, (key, value) =>
    (key === "token" || key === "deviceToken") ? `${value.slice(0, 8)}…` : value);
  console.log(`   ← ${response.status} ${response.statusText}  ${shown.length > 300 ? shown.slice(0, 300) + " …" : shown}`);
  return { status: response.status, data };
}

function step(title, explanation) {
  stepNumber++;
  console.log(`\n${stepNumber}. ${title}`);
  if (explanation) console.log(`   ${explanation}`);
}

try {
  step("Is the backend running?", "A simple health check. Hosting services ask this every few seconds.");
  await call("GET", "/api/health");

  step("Kamala's phone asks for today's medicines, but it isn't paired yet",
    "No token, so the backend refuses. Expect 401 Unauthorized.");
  await call("GET", "/api/today");

  step("Priya signs in", "The reply contains a token: the 'wristband' her phone sends from now on.");
  const login = await call("POST", "/api/auth/login", { body: { email: "priya@example.com", password: "goldendose-demo" } });
  const priya = login.data.token;

  step("Priya asks: who do I look after?", "Many-to-many in action: she looks after two people.");
  const elders = await call("GET", "/api/elders", { token: priya });
  const kamala = elders.data.find((e) => e.name === "Kamala");

  step("Priya makes a pairing code for Kamala's phone");
  const code = await call("POST", `/api/elders/${kamala.id}/pairing-code`, { token: priya });

  step("The code is typed on Kamala's phone", "Kamala's phone gets its own token. No password needed.");
  const pair = await call("POST", "/api/devices/pair", { body: { code: code.data.code, platform: "android" } });
  const kamalaPhone = pair.data.deviceToken;

  step("Kamala's phone asks again for today's medicines", "Now it works. This is what fills the Today screen.");
  const today = await call("GET", "/api/today", { token: kamalaPhone });
  console.log(`   In plain words (Kamala's time now: ${today.data.now}):`);
  for (const dose of today.data.doses) {
    const when = dose.status === "taken" || dose.status === "skipped" ? ` at ${dose.recordedAt}` : "";
    console.log(`     ${dose.time}  ${dose.medicine.name.padEnd(13)} ${dose.status}${when}`);
  }

  // Pick a dose that can be taken right now (due within the next hour, or already due and not recorded).
  const [h, m] = today.data.now.split(":").map(Number);
  const nowMinutes = h * 60 + m;
  const takeable = today.data.doses.find((d) => {
    const [dh, dm] = d.time.split(":").map(Number);
    return (d.status === "pending" || d.status === "missed") && dh * 60 + dm - nowMinutes <= 60;
  });

  if (takeable) {
    step(`Kamala taps "Taken" on ${takeable.medicine.name} (due ${takeable.time})`,
      takeable.status === "missed"
        ? "It was already marked missed and caregivers were told, so the backend updates it to taken late. Expect 200 OK."
        : "The backend saves one new row in the dose_log table. Expect 201 Created.");
    const taken = await call("POST", "/api/doses", { token: kamalaPhone, body: { scheduleId: takeable.scheduleId, status: "taken" } });

    step("Her finger taps again by accident", "The backend refuses, so it can't be counted twice. Expect 409 Conflict.");
    await call("POST", "/api/doses", { token: kamalaPhone, body: { scheduleId: takeable.scheduleId, status: "taken" } });

    step("She taps Undo", "Allowed within 5 minutes. Expect 204 No Content: done, nothing to send back.");
    await call("DELETE", `/api/doses/${taken.data.doseId}`, { token: kamalaPhone });
  } else {
    const next = today.data.doses.find((d) => d.status === "pending");
    if (next) {
      step(`Kamala tries to mark ${next.medicine.name} (due ${next.time}) too early`,
        "The backend enforces the 60-minute rule. Expect 400 Bad Request with a friendly message.");
      await call("POST", "/api/doses", { token: kamalaPhone, body: { scheduleId: next.scheduleId, status: "taken" } });
    }
  }

  step("Kamala's phone tries to open a caregiver-only page (the medicine list editor)",
    "Her phone's token only works for her own Today screen. Expect 401.");
  await call("GET", `/api/elders/${kamala.id}/medicines`, { token: kamalaPhone });

  step("Priya checks yesterday's history", "Yesterday Vitamin D3 was missed, so it shows here.");
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const history = await call("GET", `/api/elders/${kamala.id}/history?from=${yesterday}&to=${yesterday}`, { token: priya });
  for (const dose of history.data) console.log(`     ${dose.date} ${dose.time}  ${dose.medicine.name.padEnd(13)} ${dose.status}`);

  console.log("\nDone. Every line marked → was a request, and every line marked ← was the backend's reply.");
} catch (error) {
  if (error.cause?.code === "ECONNREFUSED") {
    console.error(`\nCan't reach the backend at ${BASE}. Start it first with:  npm start`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
