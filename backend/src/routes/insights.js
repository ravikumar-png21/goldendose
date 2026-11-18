// H. Insights for the family: the "Needs attention" list, the setup check, the doctor visit report,
//    the change history, and the medicine list as it was on any past date.

import { Router } from "express";
import { HttpError } from "../errors.js";
import { clock } from "../clock.js";
import { RULES } from "../config.js";
import { requireCaregiver, careLinkOrFail } from "../auth.js";
import { localParts, friendlyTime } from "../time.js";
import { attentionFor, checkupFor, reportFor } from "../insights.js";
import * as check from "../validate.js";

// A spreadsheet-friendly value: quoted, with quotes doubled ("He said ""hi""").
// Text that starts with = + - or @ would be run as a formula by Excel, so it gets a ' in front:
// Excel then shows it as plain text. Numbers (such as -5) are left alone.
export function csvCell(value) {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function insightRoutes(db) {
  const router = Router();
  router.use(["/attention", "/elders"], requireCaregiver);

  // GET /api/attention — everything that needs me, for everyone I look after, most serious first
  router.get("/attention", (req, res) => {
    res.json(attentionFor(db, req.caregiverId));
  });

  // GET /api/elders/:id/attention — the same, for one person
  router.get("/elders/:id/attention", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    res.json(attentionFor(db, req.caregiverId, [elderId]));
  });

  // GET /api/elders/:id/checkup — is everything set up?
  router.get("/elders/:id/checkup", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    res.json(checkupFor(db, elderId, req.caregiverId));
  });

  // GET /api/elders/:id/report?from=2026-09-13&to=2026-10-12  (add &format=csv for a spreadsheet)
  router.get("/elders/:id/report", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const from = check.date(req.query.from, "from");
    const to = check.date(req.query.to, "to");
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0) throw new HttpError(400, "The 'from' date must be before the 'to' date.");
    if (days > RULES.HISTORY_MAX_DAYS) throw new HttpError(400, `Ask for at most ${RULES.HISTORY_MAX_DAYS} days at a time.`);
    const report = reportFor(db, elderId, from, to);

    if (req.query.format !== "csv") return res.json(report);
    const lines = [
      ["Medicine", "Strength", "What it's for", "Times", "Taken", "Skipped", "Missed", "Taken %", "Usually taken (minutes after the time)"],
      ...report.medicines.map((m) => [m.name, m.strength, m.purpose, m.times.map(friendlyTime).join(" / "), m.taken, m.skipped, m.missed,
        m.takenPercent ?? "", m.usuallyTakenMinutesLate ?? ""]),
    ];
    const name = `GoldenDose-${report.elder.name.replace(/[^A-Za-z0-9]+/g, "-")}-${from}-to-${to}.csv`;
    res.set("Content-Disposition", `attachment; filename="${name}"`);
    res.type("text/csv").send("﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n")); // ﻿: Excel reads it as UTF-8
  });

  // GET /api/elders/:id/changes?limit=100 — the change history, newest first
  router.get("/elders/:id/changes", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const limit = req.query.limit === undefined ? 100 : Math.round(check.number(req.query.limit, "limit", { min: 1, max: 500 }));
    const rows = db
      .prepare(`SELECT ch.*, c.name AS who FROM changes ch LEFT JOIN caregivers c ON c.id = ch.caregiver_id
                WHERE ch.elder_id = ? ORDER BY ch.created_at DESC, ch.id DESC LIMIT ?`)
      .all(elderId, limit);
    res.json(rows.map((r) => ({ id: r.id, at: r.created_at, who: r.who, action: r.action, summary: r.summary, reason: r.reason, medicineId: r.medicine_id })));
  });

  // GET /api/elders/:id/medicines-on?date=2026-10-01 — the medicine list as it was at the end of that day.
  // Rebuilt from the change history. Medicines added before the history began are shown as they are now,
  // marked "approximate".
  router.get("/elders/:id/medicines-on", (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const date = check.date(req.query.date, "list");
    const { timezone } = db.prepare("SELECT timezone FROM elders WHERE id = ?").get(elderId);
    const localDate = (iso) => localParts(new Date(iso), timezone).date;
    if (date > localDate(clock.now().toISOString())) throw new HttpError(400, "Choose today or a date in the past.");

    const medicines = db.prepare("SELECT * FROM medicines WHERE elder_id = ?").all(elderId);
    const snapshots = db.prepare("SELECT action, after, created_at FROM changes WHERE medicine_id = ? AND after IS NOT NULL ORDER BY created_at, id");
    const timesOf = db.prepare("SELECT time_of_day FROM schedules WHERE medicine_id = ? AND active = 1 ORDER BY time_of_day");
    const list = [];
    for (const m of medicines) {
      const history = snapshots.all(m.id);
      const upTo = history.filter((h) => localDate(h.created_at) <= date);
      if (upTo.length) {
        const then = JSON.parse(upTo.at(-1).after);
        if (then.active) list.push({ ...then, approximate: false });
      } else if (localDate(m.created_at) <= date && history[0]?.action !== "added") {
        // It existed then, but the history began later: the best guess is how it looked at its first recorded change.
        const guess = history.length ? JSON.parse(history[0].after) : {
          id: m.id, name: m.name, strength: m.strength, instruction: m.instruction, purpose: m.purpose,
          times: timesOf.all(m.id).map((s) => s.time_of_day), active: m.active === 1,
        };
        if (guess.active || history.length) list.push({ ...guess, active: true, approximate: true });
      }
    }
    res.json({ date, medicines: list.sort((a, b) => a.name.localeCompare(b.name)) });
  });

  return router;
}
