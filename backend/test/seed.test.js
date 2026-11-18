// Tests for the demo-data loader's two safety rules (it deletes the database, so it must be careful).
// Run with:  npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const seed = fileURLToPath(new URL("../src/seed.js", import.meta.url));
const folder = mkdtempSync(join(tmpdir(), "goldendose-seed-"));
const dbFile = join(folder, "goldendose.db");
const run = (env) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", seed], {
  env: { ...process.env, DB_FILE: dbFile, QUIET: "1", NODE_ENV: "", ...env }, encoding: "utf8",
});

test("the first run makes the database, and there's nothing to back up", () => {
  assert.equal(run({}).status, 0);
  assert.ok(existsSync(dbFile));
  assert.deepEqual(readdirSync(folder).filter((name) => name.startsWith("backup-")), []);
});

test("a second run keeps a dated copy of the old database before starting fresh", () => {
  assert.equal(run({}).status, 0);
  const backups = readdirSync(folder).filter((name) => /^backup-\d{8}-\d{6}$/.test(name));
  assert.equal(backups.length, 1);
  assert.ok(existsSync(join(folder, backups[0], "goldendose.db")));
});

test("on a real server (NODE_ENV=production) it refuses, and the database is untouched", () => {
  const before = readdirSync(folder).length;
  const result = run({ NODE_ENV: "production" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refused/);
  assert.equal(readdirSync(folder).length, before);
  rmSync(folder, { recursive: true, force: true });
});
