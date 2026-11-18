// J. Health records: blood reports (with the numbers the family types), when each test should be repeated,
//    home blood pressure readings, and the next doctor visit.
//
// GoldenDose never interprets results: see health.js. Report files are private, like prescriptions.

import express, { Router } from "express";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../errors.js";
import { clock } from "../clock.js";
import { transaction } from "../db.js";
import { prescriptionsDir } from "../config.js";
import { requireCaregiver, careLinkOrFail } from "../auth.js";
import { recordChange } from "../changes.js";
import { TESTS, testByKey } from "../health-tests.js";
import { healthSummary, reportJSON, niceDate } from "../health.js";
import { fileKind, TYPES } from "./prescriptions.js";
import * as check from "../validate.js";

const optionalNumber = (v, label, opts) => (v === null || v === undefined || v === "" ? null : check.number(v, label, opts));

// Checks the results the family typed. A test from the list keeps its name; anything else is "other:<name>".
function checkResults(list) {
  if (!Array.isArray(list)) throw new HttpError(400, "Add the results as a list.");
  if (list.length > 60) throw new HttpError(400, "A report can have at most 60 results.");
  return list.map((r) => {
    const known = testByKey(r?.testKey);
    const testName = known ? known.name : check.text(r?.testName, "test name", { max: 80 });
    const testKey = known ? known.key : `other:${testName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const value = check.number(r?.value, `${testName} value`, { min: -1000, max: 1_000_000 });
    const unit = check.text(r?.unit ?? known?.unit ?? "", `${testName} unit`, { max: 30, required: false });
    const low = optionalNumber(r?.rangeLow, `${testName} range (low)`, { min: -1000, max: 1_000_000 });
    const high = optionalNumber(r?.rangeHigh, `${testName} range (high)`, { min: -1000, max: 1_000_000 });
    if (low !== null && high !== null && low > high) throw new HttpError(400, `For ${testName}, the low end of the range is above the high end.`);
    return { testKey, testName, value, unit, low, high };
  });
}

export function healthRoutes(db) {
  const router = Router();

  function reportOrFail(req) {
    const report = db
      .prepare(`SELECT r.*, s.name AS seen_by_name, a.name AS added_by_name FROM lab_reports r
                LEFT JOIN caregivers s ON s.id = r.doctor_seen_by LEFT JOIN caregivers a ON a.id = r.added_by WHERE r.id = ?`)
      .get(check.id(req.params.id, "report"));
    if (!report) throw new HttpError(404, "That blood report doesn't exist.");
    careLinkOrFail(db, req.caregiverId, report.elder_id);
    return report;
  }
  const saveResults = (reportId, elderId, results) => {
    db.prepare("DELETE FROM lab_results WHERE report_id = ?").run(reportId);
    const add = db.prepare(`INSERT INTO lab_results (report_id, elder_id, test_key, test_name, value, unit, range_low, range_high)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of results) add.run(reportId, elderId, r.testKey, r.testName, r.value, r.unit, r.low, r.high);
  };

  // GET /api/lab-tests — the list of common tests to pick from
  router.get("/lab-tests", requireCaregiver, (req, res) => res.json(TESTS));

  // GET /api/elders/:id/health-summary — reports, each test over time, BP, the next visit
  router.get("/elders/:id/health-summary", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    res.json(healthSummary(db, elderId));
  });

  // POST /api/elders/:id/lab-reports  { reportDate, lab, note, results: [{ testKey | testName, value, unit, rangeLow, rangeHigh }] }
  router.post("/elders/:id/lab-reports", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const body = req.body ?? {};
    const reportDate = check.date(body.reportDate, "report");
    const lab = check.text(body.lab, "lab name", { max: 100, required: false });
    const note = check.text(body.note, "note", { max: 300, required: false });
    const results = checkResults(body.results ?? []);
    const id = transaction(db, () => {
      const r = db.prepare("INSERT INTO lab_reports (elder_id, report_date, lab, note, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(elderId, reportDate, lab, note, req.caregiverId, clock.now().toISOString());
      const reportId = Number(r.lastInsertRowid);
      saveResults(reportId, elderId, results);
      return reportId;
    });
    recordChange(db, { elderId, caregiverId: req.caregiverId, action: "health",
      summary: `Added a blood report from ${niceDate(reportDate)}${lab ? ` (${lab})` : ""} with ${results.length} result${results.length === 1 ? "" : "s"}` });
    res.status(201).json(reportJSON(db, reportOrFail({ ...req, params: { id: String(id) } })));
  });

  // PUT /api/lab-reports/:id — change the date, lab, note or results (results replace the old list)
  router.put("/lab-reports/:id", requireCaregiver, (req, res) => {
    const report = reportOrFail(req);
    const body = req.body ?? {};
    const reportDate = body.reportDate === undefined ? report.report_date : check.date(body.reportDate, "report");
    const lab = body.lab === undefined ? report.lab : check.text(body.lab, "lab name", { max: 100, required: false });
    const note = body.note === undefined ? report.note : check.text(body.note, "note", { max: 300, required: false });
    const results = body.results === undefined ? null : checkResults(body.results);
    transaction(db, () => {
      db.prepare("UPDATE lab_reports SET report_date = ?, lab = ?, note = ? WHERE id = ?").run(reportDate, lab, note, report.id);
      if (results) saveResults(report.id, report.elder_id, results);
    });
    res.json(reportJSON(db, reportOrFail(req)));
  });

  // POST /api/lab-reports/:id/file — a photo or PDF of the report (up to 10 MB)
  router.post("/lab-reports/:id/file", requireCaregiver, express.raw({ type: Object.values(TYPES), limit: "10mb" }), (req, res) => {
    const report = reportOrFail(req);
    const file = req.body;
    if (!Buffer.isBuffer(file) || file.length === 0) throw new HttpError(400, "Choose a photo or PDF of the report.");
    const kind = fileKind(file);
    if (!kind) throw new HttpError(400, "That file isn't a photo or PDF. Try a JPEG, PNG or PDF.");
    const folder = prescriptionsDir();
    mkdirSync(folder, { recursive: true });
    const fileName = `lab-${report.elder_id}-${randomBytes(16).toString("hex")}.${kind}`;
    writeFileSync(join(folder, fileName), file);
    if (report.file_name) rmSync(join(folder, report.file_name), { force: true });
    db.prepare("UPDATE lab_reports SET file_name = ?, kind = ? WHERE id = ?").run(fileName, kind, report.id);
    res.status(201).json(reportJSON(db, reportOrFail(req)));
  });

  // GET /api/lab-reports/:id/file — only for the elder's family
  router.get("/lab-reports/:id/file", requireCaregiver, (req, res) => {
    const report = reportOrFail(req);
    if (!report.file_name) throw new HttpError(404, "This report has no photo or PDF.");
    const path = join(prescriptionsDir(), report.file_name);
    if (!existsSync(path)) throw new HttpError(404, "The file is missing.");
    res.set("Cache-Control", "private, no-store");
    res.type(TYPES[report.kind]).sendFile(path);
  });

  // POST /api/lab-reports/:id/doctor-seen — "the doctor has seen it" (send { seen: false } to undo)
  router.post("/lab-reports/:id/doctor-seen", requireCaregiver, (req, res) => {
    const report = reportOrFail(req);
    const seen = req.body?.seen === undefined ? true : check.boolean(req.body.seen, "seen");
    db.prepare("UPDATE lab_reports SET doctor_seen_at = ?, doctor_seen_by = ? WHERE id = ?")
      .run(seen ? clock.now().toISOString() : null, seen ? req.caregiverId : null, report.id);
    if (seen) recordChange(db, { elderId: report.elder_id, caregiverId: req.caregiverId, action: "health", summary: `Marked the blood report from ${niceDate(report.report_date)} as seen by the doctor` });
    res.json(reportJSON(db, reportOrFail(req)));
  });

  // DELETE /api/lab-reports/:id — the report, its results and its file
  router.delete("/lab-reports/:id", requireCaregiver, (req, res) => {
    const report = reportOrFail(req);
    db.prepare("DELETE FROM lab_reports WHERE id = ?").run(report.id);
    if (report.file_name) rmSync(join(prescriptionsDir(), report.file_name), { force: true });
    recordChange(db, { elderId: report.elder_id, caregiverId: req.caregiverId, action: "health", summary: `Removed the blood report from ${niceDate(report.report_date)}` });
    res.status(204).end();
  });

  // PUT /api/elders/:id/test-followups  { testKey, testName?, repeatMonths: 1–24 | null } — how often the doctor wants it
  router.put("/elders/:id/test-followups", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const testKey = check.text(req.body?.testKey, "test", { max: 100 });
    const known = testByKey(testKey);
    const testName = known?.name ?? check.text(req.body?.testName, "test name", { max: 80 });
    if (req.body?.repeatMonths === null) {
      db.prepare("DELETE FROM test_followups WHERE elder_id = ? AND test_key = ?").run(elderId, testKey);
      recordChange(db, { elderId, caregiverId: req.caregiverId, action: "health", summary: `Stopped reminders to repeat ${testName}` });
      return res.json({ testKey, repeatMonths: null });
    }
    const months = Math.round(check.number(req.body?.repeatMonths, "months", { min: 1, max: 24 }));
    db.prepare(`INSERT INTO test_followups (elder_id, test_key, test_name, repeat_months, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (elder_id, test_key) DO UPDATE SET repeat_months = excluded.repeat_months, set_by = excluded.set_by, set_at = excluded.set_at`)
      .run(elderId, testKey, testName, months, req.caregiverId, clock.now().toISOString());
    recordChange(db, { elderId, caregiverId: req.caregiverId, action: "health", summary: `${testName}: repeat every ${months} month${months === 1 ? "" : "s"}, as the doctor asked` });
    res.json({ testKey, repeatMonths: months });
  });

  // POST /api/elders/:id/bp  { systolic, diastolic, pulse?, takenAt?, note? } — a home blood pressure reading
  router.post("/elders/:id/bp", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const b = req.body ?? {};
    const systolic = Math.round(check.number(b.systolic, "top number (systolic)", { min: 50, max: 300 }));
    const diastolic = Math.round(check.number(b.diastolic, "bottom number (diastolic)", { min: 20, max: 200 }));
    if (diastolic >= systolic) throw new HttpError(400, "The top number should be bigger than the bottom one, like 130/80.");
    const pulse = b.pulse === undefined || b.pulse === null || b.pulse === "" ? null : Math.round(check.number(b.pulse, "pulse", { min: 20, max: 250 }));
    const takenAt = b.takenAt === undefined || b.takenAt === null || b.takenAt === "" ? clock.now() : check.moment(b.takenAt, "reading", clock.now());
    const note = check.text(b.note, "note", { max: 200, required: false });
    const r = db.prepare("INSERT INTO bp_readings (elder_id, systolic, diastolic, pulse, taken_at, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(elderId, systolic, diastolic, pulse, takenAt.toISOString(), note, req.caregiverId);
    res.status(201).json({ id: Number(r.lastInsertRowid), systolic, diastolic, pulse, takenAt: takenAt.toISOString(), note });
  });

  // DELETE /api/bp/:id — a reading typed by mistake
  router.delete("/bp/:id", requireCaregiver, (req, res) => {
    const reading = db.prepare("SELECT * FROM bp_readings WHERE id = ?").get(check.id(req.params.id, "reading"));
    if (!reading) throw new HttpError(404, "That reading doesn't exist.");
    careLinkOrFail(db, req.caregiverId, reading.elder_id);
    db.prepare("DELETE FROM bp_readings WHERE id = ?").run(reading.id);
    res.status(204).end();
  });

  // POST /api/elders/:id/readings  { kind: "weight" | "sugar", value, context? (sugar: fasting, after-meal, random), takenAt?, note? }
  router.post("/elders/:id/readings", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const b = req.body ?? {};
    const kind = check.oneOf(b.kind, ["weight", "sugar"], "reading");
    const value = kind === "weight"
      ? Math.round(check.number(b.value, "weight in kg", { min: 10, max: 300 }) * 10) / 10
      : Math.round(check.number(b.value, "blood sugar in mg/dL", { min: 20, max: 700 }));
    const context = kind === "sugar" ? check.oneOf(b.context ?? "random", ["fasting", "after-meal", "random"], "when the sugar was checked") : null;
    const takenAt = b.takenAt === undefined || b.takenAt === null || b.takenAt === "" ? clock.now() : check.moment(b.takenAt, "reading", clock.now());
    const note = check.text(b.note, "note", { max: 200, required: false });
    const r = db.prepare("INSERT INTO health_readings (elder_id, kind, value, context, taken_at, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(elderId, kind, value, context, takenAt.toISOString(), note, req.caregiverId);
    res.status(201).json({ id: Number(r.lastInsertRowid), kind, value, context, takenAt: takenAt.toISOString(), note });
  });

  // DELETE /api/readings/:id — a weight or sugar reading typed by mistake
  router.delete("/readings/:id", requireCaregiver, (req, res) => {
    const reading = db.prepare("SELECT * FROM health_readings WHERE id = ?").get(check.id(req.params.id, "reading"));
    if (!reading) throw new HttpError(404, "That reading doesn't exist.");
    careLinkOrFail(db, req.caregiverId, reading.elder_id);
    db.prepare("DELETE FROM health_readings WHERE id = ?").run(reading.id);
    res.status(204).end();
  });

  // POST /api/elders/:id/doctor-questions  { text } — a question to ask at the next visit
  router.post("/elders/:id/doctor-questions", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const text = check.text(req.body?.text, "question", { max: 300 });
    const r = db.prepare("INSERT INTO doctor_questions (elder_id, text, added_by, created_at) VALUES (?, ?, ?, ?)")
      .run(elderId, text, req.caregiverId, clock.now().toISOString());
    res.status(201).json({ id: Number(r.lastInsertRowid), text, answeredAt: null, answer: "" });
  });

  // PUT /api/doctor-questions/:id  { answered: true | false, answer? } — what the doctor said
  router.put("/doctor-questions/:id", requireCaregiver, (req, res) => {
    const q = db.prepare("SELECT * FROM doctor_questions WHERE id = ?").get(check.id(req.params.id, "question"));
    if (!q) throw new HttpError(404, "That question doesn't exist.");
    careLinkOrFail(db, req.caregiverId, q.elder_id);
    const answered = check.boolean(req.body?.answered, "answered");
    const answer = req.body?.answer === undefined ? q.answer : check.text(req.body.answer, "answer", { max: 500, required: false });
    db.prepare("UPDATE doctor_questions SET answered_at = ?, answer = ? WHERE id = ?").run(answered ? clock.now().toISOString() : null, answer, q.id);
    res.json({ id: q.id, text: q.text, answeredAt: answered ? clock.now().toISOString() : null, answer });
  });

  // DELETE /api/doctor-questions/:id
  router.delete("/doctor-questions/:id", requireCaregiver, (req, res) => {
    const q = db.prepare("SELECT * FROM doctor_questions WHERE id = ?").get(check.id(req.params.id, "question"));
    if (!q) throw new HttpError(404, "That question doesn't exist.");
    careLinkOrFail(db, req.caregiverId, q.elder_id);
    db.prepare("DELETE FROM doctor_questions WHERE id = ?").run(q.id);
    res.status(204).end();
  });

  // PUT /api/elders/:id/health-settings  { bpCheckDays, bpTarget: { systolic, diastolic } | null, nextVisit: { on, note } | null,
  //                                      lab: { name, phone } | null, weightCheckDays, sugarCheckDays }
  router.put("/elders/:id/health-settings", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const e = db.prepare("SELECT * FROM elders WHERE id = ?").get(elderId);
    const b = req.body ?? {};
    const days = b.bpCheckDays === undefined ? e.bp_check_days : b.bpCheckDays === null ? null : Math.round(check.number(b.bpCheckDays, "days between BP checks", { min: 1, max: 90 }));
    let sys = e.bp_target_sys, dia = e.bp_target_dia;
    if (b.bpTarget !== undefined) {
      sys = b.bpTarget === null ? null : Math.round(check.number(b.bpTarget.systolic, "target top number", { min: 80, max: 220 }));
      dia = b.bpTarget === null || b.bpTarget.diastolic == null ? null : Math.round(check.number(b.bpTarget.diastolic, "target bottom number", { min: 40, max: 140 }));
    }
    const everyDays = (v, current, label) => (v === undefined ? current : v === null ? null : Math.round(check.number(v, label, { min: 1, max: 90 })));
    const weightDays = everyDays(b.weightCheckDays, e.weight_check_days, "days between weight checks");
    const sugarDays = everyDays(b.sugarCheckDays, e.sugar_check_days, "days between sugar checks");
    let labName = e.lab_name, labPhone = e.lab_phone;
    if (b.lab !== undefined) {
      labName = b.lab === null ? null : check.text(b.lab.name, "lab name", { max: 100, required: false }) || null;
      labPhone = b.lab === null ? null : check.phone(b.lab.phone, "lab's WhatsApp number");
    }
    let visitOn = e.next_visit_on, visitNote = e.next_visit_note;
    if (b.nextVisit !== undefined) {
      visitOn = b.nextVisit === null || !b.nextVisit.on ? null : check.date(b.nextVisit.on, "doctor visit");
      visitNote = b.nextVisit === null ? "" : check.text(b.nextVisit.note, "note", { max: 200, required: false });
    }
    db.prepare(`UPDATE elders SET bp_check_days = ?, bp_target_sys = ?, bp_target_dia = ?, next_visit_on = ?, next_visit_note = ?,
                lab_name = ?, lab_phone = ?, weight_check_days = ?, sugar_check_days = ? WHERE id = ?`)
      .run(days, sys, dia, visitOn, visitNote, labName, labPhone, weightDays, sugarDays, elderId);
    const said = [];
    if (days !== e.bp_check_days) said.push(days ? `check BP every ${days} days` : "no BP reminders");
    if (sys !== e.bp_target_sys || dia !== e.bp_target_dia) said.push(sys ? `BP target ${sys}/${dia ?? "–"}` : "no BP target");
    if (visitOn !== e.next_visit_on) said.push(visitOn ? `next doctor visit ${niceDate(visitOn)}` : "no doctor visit set");
    if (labName !== e.lab_name || labPhone !== e.lab_phone) said.push(`lab → ${labName || labPhone || "none"}`);
    if (weightDays !== e.weight_check_days) said.push(weightDays ? `weigh every ${weightDays} days` : "no weight reminders");
    if (sugarDays !== e.sugar_check_days) said.push(sugarDays ? `check sugar every ${sugarDays} days` : "no sugar reminders");
    if (said.length) recordChange(db, { elderId, caregiverId: req.caregiverId, action: "health", summary: `Health settings: ${said.join("; ")}` });
    res.json(healthSummary(db, elderId));
  });

  return router;
}
