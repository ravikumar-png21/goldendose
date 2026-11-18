// The backend app: connects every route and handles errors in one place.

import express from "express";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { HttpError } from "./errors.js";
import { identifyCaller } from "./auth.js";
import { accountRoutes } from "./routes/accounts.js";
import { elderRoutes } from "./routes/elders.js";
import { deviceRoutes } from "./routes/devices.js";
import { medicineRoutes } from "./routes/medicines.js";
import { todayRoutes } from "./routes/today.js";
import { emergencyRoutes } from "./routes/emergency.js";
import { prescriptionRoutes } from "./routes/prescriptions.js";
import { insightRoutes } from "./routes/insights.js";
import { askRoutes } from "./routes/ask.js";
import { healthRoutes } from "./routes/health.js";
import { photosDir } from "./config.js";
import { securityHeaders } from "./security.js";

const frontendFolder = fileURLToPath(new URL("../../frontend", import.meta.url));

export function createApp(db) {
  const app = express();

  // Behind a hosting service, every request arrives from the hosting service's own address.
  // TRUST_PROXY=1 tells Express to read the real visitor's address instead (needed for limiter.js).
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

  // 0. Browser safety headers on every reply, and don't announce which software this is.
  app.disable("x-powered-by");
  app.use(securityHeaders);

  // 1. Read JSON request bodies (and refuse very large ones).
  app.use(express.json({ limit: "100kb" }));

  // (Demo mode) Print every API request in the terminal, so you can watch the frontend talk to the backend.
  if (process.env.LOG_REQUESTS === "1") {
    app.use("/api", (req, res, next) => {
      const started = Date.now();
      res.on("finish", () => {
        const who = req.caregiverId ? "caregiver" : req.elderId ? "elder's phone" : "not signed in";
        console.log(`  API  ${req.method.padEnd(6)} ${req.originalUrl.padEnd(42)} → ${res.statusCode}   (${who}, ${Date.now() - started} ms)`);
      });
      next();
    });
  }

  // 2. Work out who is calling, from the token they send.
  app.use("/api", identifyCaller(db));

  // 3. The API itself.
  app.get("/api/health", (req, res) => res.json({ ok: true, app: "GoldenDose" }));

  // GET /api/address — the address another phone on the same Wi-Fi can open ("http://192.168.1.5:3000").
  // "localhost" only works on this computer, so the family app shows this instead when connecting a phone.
  app.get("/api/address", (req, res) => {
    const wifi = Object.values(networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal)?.address;
    const port = req.socket.localPort;
    res.json({ wifi: wifi ? `http://${wifi}:${port}` : null });
  });
  app.use("/api", accountRoutes(db));
  app.use("/api", elderRoutes(db));
  app.use("/api", deviceRoutes(db));
  app.use("/api", medicineRoutes(db));
  app.use("/api", todayRoutes(db));
  app.use("/api", emergencyRoutes(db));
  app.use("/api", prescriptionRoutes(db));
  app.use("/api", insightRoutes(db));
  app.use("/api", askRoutes(db));
  app.use("/api", healthRoutes(db));

  // An /api address that doesn't exist.
  app.use("/api", (req, res) => res.status(404).json({ error: "There's no such API address." }));

  // 4. Pill photos, and the screens themselves:
  //    http://localhost:3000/       Kamala's app
  //    http://localhost:3000/care/  the caregiver app
  app.use("/photos", express.static(photosDir(), { maxAge: "7d" }));
  app.use(express.static(frontendFolder));

  // 5. Errors. Whatever went wrong above ends up here and becomes a tidy JSON reply.
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "The request body isn't valid JSON." });
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: "That request is too large." });
    }
    console.error(error); // a real bug: show it to developers in the terminal...
    res.status(500).json({ error: "Something went wrong on our side. Try again." }); // ...but not to users
  });

  return app;
}
