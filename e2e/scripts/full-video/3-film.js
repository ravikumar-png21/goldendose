// Step 3: films the live scenes the chosen video needs, in the real apps on a fresh test backend (port 3100).
//
//   node 3-film.js <video>
//   docs/fullvideo/live/<film>/frames/NNNNNN.jpg   every change on screen, as it happened
//   docs/fullvideo/live/<film>/timeline.json       when each picture appeared, and when each scene started and ended
//
// The films themselves are in films/: first-time.js and more.js.
import { startTestServer, setDemoClock } from "../lib.js";
import { chosenVideo } from "./lines.js";

const { lines } = chosenVideo();
const films = [...new Set(lines.map((l) => l.picture.film).filter(Boolean))];

setDemoClock("20:10"); // an evening: earlier doses missed, later ones still to come
await startTestServer();
for (const film of films) {
  const { default: run } = await import(`./films/${film}.js`);
  await run();
}
process.exit(0);
