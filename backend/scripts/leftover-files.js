// Finds files in the photos and prescriptions folders that no record points to any more
// ("leftover files"). Older versions left a blood report's file behind when a person was removed.
//
//   node scripts/leftover-files.js            lists them. Nothing is changed.
//   node scripts/leftover-files.js --delete   deletes them. Run the list first and read it.
//
// It reads the same database and folders as the app (DB_FILE, PHOTOS_DIR, PRESCRIPTIONS_DIR).

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { openDatabase } from "../src/db.js";
import { DB_FILE, photosDir, prescriptionsDir } from "../src/config.js";

// The names of the files in a folder that aren't in the "wanted" list.
export function leftoverIn(folder, wanted) {
  if (!existsSync(folder)) return [];
  const keep = new Set(wanted);
  return readdirSync(folder).filter((name) => statSync(join(folder, name)).isFile() && !keep.has(name));
}

export function findLeftovers(db) {
  const photos = [
    ...db.prepare("SELECT photo_url FROM medicines WHERE photo_url IS NOT NULL").all().map((m) => basename(m.photo_url)),
    ...db.prepare("SELECT request FROM pending_changes WHERE status = 'waiting'").all()
      .map((p) => JSON.parse(p.request).photoUrl).filter(Boolean).map((url) => basename(url)),
  ];
  const records = [
    ...db.prepare("SELECT file_name FROM prescriptions").all().map((p) => p.file_name),
    ...db.prepare("SELECT file_name FROM lab_reports WHERE file_name IS NOT NULL").all().map((r) => r.file_name),
  ];
  return [
    ...leftoverIn(photosDir(), photos).map((name) => join(photosDir(), name)),
    ...leftoverIn(prescriptionsDir(), records).map((name) => join(prescriptionsDir(), name)),
  ];
}

// Only when run directly (not when a test imports the functions above)
if (import.meta.url === `file://${process.argv[1]}`) {
  const leftovers = findLeftovers(openDatabase(DB_FILE));
  if (leftovers.length === 0) {
    console.log("No leftover files. Every file belongs to a record.");
  } else if (process.argv.includes("--delete")) {
    for (const file of leftovers) rmSync(file, { force: true });
    console.log(`Deleted ${leftovers.length} leftover file(s).`);
  } else {
    console.log(`${leftovers.length} leftover file(s) that no record points to:`);
    for (const file of leftovers) console.log(`  ${file}`);
    console.log("\nNothing was changed. To delete them:  node scripts/leftover-files.js --delete");
  }
}
