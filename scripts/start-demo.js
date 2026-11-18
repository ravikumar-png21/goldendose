// Starts GoldenDose ready for a presentation.   Run from the medstracker folder:  npm run demo
//
// 1. Resets the database to fresh demo data (Priya, Arjun, Kamala, Ramesh)
// 2. Starts the backend, printing every API request so the audience can see "behind the scenes"
// 3. Adds a medicine for Kamala due a few minutes from now, so the alarm rings during the demo
// 4. Prints the addresses to open
//
// Options:  npm run demo -- --alarm-in 8      (alarm 8 minutes after starting; default 5)
// Stop with Ctrl + C.

import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const BASE = "http://localhost:3000";
const backendFolder = fileURLToPath(new URL("../backend/", import.meta.url));
const nodeFlags = ["--disable-warning=ExperimentalWarning"];
const flag = process.argv.indexOf("--alarm-in");
const alarmIn = flag > -1 ? Number(process.argv[flag + 1]) : 5;
if (!Number.isInteger(alarmIn) || alarmIn < 2 || alarmIn > 120) {
  console.error("--alarm-in must be a whole number of minutes between 2 and 120.");
  process.exit(1);
}

const isRunning = async () => {
  try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
};

if (await isRunning()) {
  console.error("\nGoldenDose is already running on port 3000.");
  console.error("Stop it first: click in its terminal tab and press Ctrl + C. Then run  npm run demo  again.\n");
  process.exit(1);
}

// 1. Fresh demo data
console.log("\n① Resetting to fresh demo data…");
execFileSync(process.execPath, [...nodeFlags, "src/seed.js"], { cwd: backendFolder, stdio: "inherit" });

// 2. Start the backend
console.log("\n② Starting the backend…\n");
const server = spawn(process.execPath, [...nodeFlags, "src/server.js"], {
  cwd: backendFolder,
  env: { ...process.env, LOG_REQUESTS: "1" },
  stdio: "inherit",
});
const stop = () => { server.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => { if (code) { console.error(`The backend stopped (code ${code}).`); process.exit(code); } });

for (let i = 0; i < 50 && !(await isRunning()); i++) await new Promise((r) => setTimeout(r, 200));
if (!(await isRunning())) { console.error("The backend didn't start. See the messages above."); stop(); }

// 3. A medicine due in a few minutes, added through the API like Priya would
const api = async (method, path, token, body) => {
  const reply = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return reply.json();
};
const { token } = await api("POST", "/api/auth/login", null, { email: "priya@example.com", password: "goldendose-demo" });
const kamala = (await api("GET", "/api/elders", token)).find((e) => e.name === "Kamala");
// Only the Calcium alarm should ring during the demo. Doses from the demo data that happen to be
// due around now (e.g. Metformin at 8 pm) are marked taken, through a temporary paired phone.
const { code } = await api("POST", `/api/elders/${kamala.id}/pairing-code`, token);
const { deviceToken } = await api("POST", "/api/devices/pair", null, { code, platform: "web" });
const today = await api("GET", "/api/today", deviceToken);
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
for (const dose of today.doses) {
  const minutesUntilDue = toMinutes(dose.time) - toMinutes(today.now);
  if (dose.status === "pending" && minutesUntilDue <= 60 && minutesUntilDue > -30) {
    await api("POST", "/api/doses", deviceToken, { scheduleId: dose.scheduleId, status: "taken" });
  }
}

const due = new Date(Date.now() + alarmIn * 60_000);
const dueHHMM = due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: kamala.timezone });
const dueFriendly = due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: kamala.timezone }).toLowerCase();
await api("POST", `/api/elders/${kamala.id}/medicines`, token, {
  name: "Calcium", strength: "500 mg", instruction: "Take one orange tablet with water", purpose: "Bone strength (calcium supplement)",
  pillShape: "oval", pillColor: "#F29B4E", times: [dueHHMM],
});

// 4. Where to go
const wifi = Object.values(networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal)?.address;
console.log(`
══════════════════════════════════════════════════════════════════
  GoldenDose demo is ready
══════════════════════════════════════════════════════════════════
  Family app (Priya):   ${BASE}/care/
                        priya@example.com  /  goldendose-demo
  Kamala's app:         ${BASE}/
                        (get a connection code in the family app)
${wifi ? `  On a phone (same Wi-Fi): http://${wifi}:3000/\n` : ""}
  ⏰ Kamala's Calcium alarm rings at ${dueFriendly}
     (pair Kamala's app and tap it once before then)

  Behind the scenes: API requests appear below as they happen.
  Database:  in a new terminal tab, run  cd backend && npm run peek
  Stop:      Ctrl + C
══════════════════════════════════════════════════════════════════
`);
