// G. Prescriptions: photos or PDFs of the doctor's prescriptions, kept with the elder's medicines.
//
// Prescriptions are private health records, so unlike pill photos they are NOT served openly:
// each file is sent only to a signed-in caregiver who looks after that elder.

import express, { Router } from "express";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../errors.js";
import { clock } from "../clock.js";
import { prescriptionsDir } from "../config.js";
import { requireCaregiver, careLinkOrFail } from "../auth.js";
import { recordChange } from "../changes.js";
import * as check from "../validate.js";

export const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

// The file's first bytes say what it really is, whatever its label says.
export function fileKind(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  return null;
}

function prescriptionJSON(p) {
  return {
    id: p.id, elderId: p.elder_id, kind: p.kind, doctor: p.doctor, issuedOn: p.issued_on, note: p.note,
    uploadedBy: p.uploader ?? null, uploadedAt: p.created_at, fileUrl: `/api/prescriptions/${p.id}/file`,
  };
}

export function prescriptionRoutes(db) {
  const router = Router();

  function prescriptionOrFail(req) {
    const p = db
      .prepare(`SELECT p.*, c.name AS uploader FROM prescriptions p LEFT JOIN caregivers c ON c.id = p.uploaded_by WHERE p.id = ?`)
      .get(check.id(req.params.id, "prescription"));
    if (!p) throw new HttpError(404, "That prescription doesn't exist.");
    careLinkOrFail(db, req.caregiverId, p.elder_id);
    return p;
  }

  function describe(p) {
    return `prescription${p.doctor ? ` from ${p.doctor}` : ""}${p.issued_on ? ` dated ${p.issued_on}` : ""}`;
  }

  // GET /api/elders/:id/prescriptions — newest first
  router.get("/elders/:id/prescriptions", requireCaregiver, (req, res) => {
    const elderId = check.id(req.params.id);
    careLinkOrFail(db, req.caregiverId, elderId);
    const rows = db
      .prepare(`SELECT p.*, c.name AS uploader FROM prescriptions p LEFT JOIN caregivers c ON c.id = p.uploaded_by
                WHERE p.elder_id = ? ORDER BY COALESCE(p.issued_on, substr(p.created_at, 1, 10)) DESC, p.id DESC`)
      .all(elderId);
    res.json(rows.map(prescriptionJSON));
  });

  // POST /api/elders/:id/prescriptions — the body is the file itself (photo or PDF, up to 10 MB).
  // The doctor's name, date and a note are added afterwards with PUT.
  router.post(
    "/elders/:id/prescriptions",
    requireCaregiver,
    express.raw({ type: Object.values(TYPES), limit: "10mb" }),
    (req, res) => {
      const elderId = check.id(req.params.id);
      careLinkOrFail(db, req.caregiverId, elderId);
      const file = req.body;
      if (!Buffer.isBuffer(file) || file.length === 0) throw new HttpError(400, "Choose a photo or PDF of the prescription.");
      const kind = fileKind(file);
      if (!kind) throw new HttpError(400, "That file isn't a photo or PDF. Try a JPEG, PNG or PDF.");

      const folder = prescriptionsDir();
      mkdirSync(folder, { recursive: true });
      const fileName = `${elderId}-${randomBytes(16).toString("hex")}.${kind}`; // a random name nobody can guess
      writeFileSync(join(folder, fileName), file);

      const result = db
        .prepare("INSERT INTO prescriptions (elder_id, file_name, kind, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(elderId, fileName, kind, req.caregiverId, clock.now().toISOString());
      const p = prescriptionOrFail({ ...req, params: { id: String(result.lastInsertRowid) } });
      recordChange(db, { elderId, caregiverId: req.caregiverId, action: "prescription", summary: "Uploaded a prescription" });
      res.status(201).json(prescriptionJSON(p));
    },
  );

  // PUT /api/prescriptions/:id — the doctor's name, the date on it, and a note
  router.put("/prescriptions/:id", requireCaregiver, (req, res) => {
    const p = prescriptionOrFail(req);
    const body = req.body ?? {};
    const doctor = body.doctor === undefined ? p.doctor : check.text(body.doctor, "doctor's name", { max: 100, required: false });
    const issuedOn = body.issuedOn === undefined ? p.issued_on : body.issuedOn === null || body.issuedOn === "" ? null : check.date(body.issuedOn, "prescription");
    const note = body.note === undefined ? p.note : check.text(body.note, "note", { max: 300, required: false });
    db.prepare("UPDATE prescriptions SET doctor = ?, issued_on = ?, note = ? WHERE id = ?").run(doctor, issuedOn, note, p.id);
    res.json(prescriptionJSON(prescriptionOrFail(req)));
  });

  // GET /api/prescriptions/:id/file — the photo or PDF itself
  router.get("/prescriptions/:id/file", requireCaregiver, (req, res) => {
    const p = prescriptionOrFail(req);
    const path = join(prescriptionsDir(), p.file_name);
    if (!existsSync(path)) throw new HttpError(404, "The file is missing.");
    res.set("Cache-Control", "private, no-store"); // health records: don't keep copies in shared caches
    res.type(TYPES[p.kind]).sendFile(path);
  });

  // DELETE /api/prescriptions/:id — removes the record and its file
  router.delete("/prescriptions/:id", requireCaregiver, (req, res) => {
    const p = prescriptionOrFail(req);
    db.prepare("DELETE FROM prescriptions WHERE id = ?").run(p.id);
    rmSync(join(prescriptionsDir(), p.file_name), { force: true });
    recordChange(db, { elderId: p.elder_id, caregiverId: req.caregiverId, action: "prescription", summary: `Removed a ${describe(p)}` });
    res.status(204).end();
  });

  return router;
}
