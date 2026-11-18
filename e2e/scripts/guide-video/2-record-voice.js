// Part 2 of the click-by-click video: records the narration with the Mac's built-in voice.
//
//   docs/clickguide/video/voice/NN-<id>.aiff   one recording per slide
//
// Choose a different voice or speed:  VOICE=Daniel RATE=160 node scripts/guide-video/2-record-voice.js
// List the voices on this Mac:        say -v '?'
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const guide = fileURLToPath(new URL("../../../docs/clickguide/", import.meta.url));
const voiceDir = `${guide}video/voice/`;
const VOICE = process.env.VOICE ?? "Samantha"; // warm, clear English
const RATE = process.env.RATE ?? "140";        // words per minute: slow and gentle, every word clear

// Gentle pauses: Samantha understands [[slnc N]] (N milliseconds of silence).
// Other voices may read the command aloud, so pauses are only added for voices known to support them.
const PAUSES = process.env.PAUSES ?? (VOICE === "Samantha" ? "on" : "off");
function withPauses(words) {
  if (PAUSES !== "on") return words;
  return words
    .replace(/^(Step \d+\.)\s*/, "$1 [[slnc 600]] ")       // a breath after the step number
    .replace(/([.!?]"?)\s+/g, "$1 [[slnc 450]] ")          // between sentences
    .replace(/:\s+/g, ": [[slnc 250]] ");                   // a little pause after a colon
}

const deck = JSON.parse(readFileSync(`${guide}slides/project/deck.json`, "utf8"));
const narration = JSON.parse(readFileSync(`${guide}video/narration.json`, "utf8"));

rmSync(voiceDir, { recursive: true, force: true });
mkdirSync(voiceDir, { recursive: true });

for (const [index, id] of deck.order.entries()) {
  const words = narration[id];
  if (!words) throw new Error(`narration.json has no text for slide "${id}".`);
  const file = `${voiceDir}${String(index + 1).padStart(2, "0")}-${id}.aiff`;
  execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", file, withPauses(words)]);
  process.stdout.write(`\rRecorded ${index + 1} of ${deck.order.length}`);
}
console.log(`\nVoice: ${VOICE} at ${RATE} words a minute. Files in ${voiceDir}`);
