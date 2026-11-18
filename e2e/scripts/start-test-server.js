// Starts a fresh GoldenDose backend for the browser tests:
// a throwaway database in a temporary folder, filled with the demo data, on port 3100.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const folder = mkdtempSync(join(tmpdir(), "goldendose-e2e-"));
process.env.DB_FILE = process.env.TEST_DB_FILE ?? join(folder, "test.db"); // a script may choose the file, to add history

process.env.PHOTOS_DIR = join(folder, "photos");
process.env.PRESCRIPTIONS_DIR = join(folder, "prescriptions");
process.env.GOLDENDOSE_AI = "off"; // "Ask" gives its simple answers: tests never call the paid AI
process.env.PORT = "3100";
process.env.QUIET = "1";

// These files read the settings above when they load, so load them only now.
if (process.env.EMPTY !== "1") await import("../../backend/src/seed.js"); // EMPTY=1: start with no one at all
await import("../../backend/src/server.js");
