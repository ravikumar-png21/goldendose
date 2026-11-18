// Starts the backend: open the database, start the API, start the missed-dose check.
// Run with:  npm start

import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { startMissedDoseJob } from "./jobs/missedDoses.js";
import { PORT, DB_FILE } from "./config.js";

const db = openDatabase(DB_FILE);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`GoldenDose backend is running at http://localhost:${PORT}`);
  console.log(`Database file: ${DB_FILE}`);
  console.log("Missed-dose check runs every minute. Press Ctrl + C to stop.\n");
});

startMissedDoseJob(db);
