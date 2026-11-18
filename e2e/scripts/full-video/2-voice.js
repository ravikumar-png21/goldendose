// Step 2: the voice. Emma, from Kokoro (a free, open-source voice that runs on this Mac).
//
//   node 2-voice.js <video>
//   docs/fullvideo/voice/<id>.wav       one recording per line
//   docs/fullvideo/voice/lengths.json   each line's words and length in seconds (the filming paces itself by these)
//
// Lines whose words haven't changed are kept, so only new or edited lines are spoken again.
// Kokoro lives in tools/voice (set up once with: cd tools/voice && npm install).
// Another voice:  VOICE=af_heart npm run full-video -- live   (then delete docs/fullvideo/voice to redo every line)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chosenVideo } from "./lines.js";

const { name, lines } = chosenVideo();
const voiceDir = fileURLToPath(new URL("../../../docs/fullvideo/voice/", import.meta.url));
const speak = fileURLToPath(new URL("../../../tools/voice/speak.js", import.meta.url));
const VOICE = process.env.VOICE ?? "bf_emma"; // Emma: calm British English. Bella was "af_bella".
// A touch slower than Kokoro's normal pace, so Emma sounds warm and unhurried (1 = normal speed).
const SPEED = process.env.SPEED ?? "0.86";
process.env.SPEED = SPEED; // speak.js reads it
mkdirSync(voiceDir, { recursive: true });

// Written "GoldenDose", said "Golden Dose" (and "goldendose-demo" as "golden dose dash demo").
const spoken = (text) => text.replace(/GoldenDose/g, "Golden Dose").replace(/goldendose/gi, "golden dose");

const lengthsFile = `${voiceDir}lengths.json`;
const lengths = existsSync(lengthsFile) ? JSON.parse(readFileSync(lengthsFile, "utf8")) : {};
const fresh = (line) => lengths[line.id]?.say === line.say && lengths[line.id]?.voice === VOICE && lengths[line.id]?.speed === SPEED && existsSync(`${voiceDir}${line.id}.wav`);

const todo = lines.filter((line) => !fresh(line));
if (todo.length) {
  writeFileSync(`${voiceDir}jobs.json`, JSON.stringify(todo.map((l) => ({ out: `${voiceDir}${l.id}.wav`, text: spoken(l.say) }))));
  execFileSync(process.execPath, [speak, VOICE, "--list", `${voiceDir}jobs.json`], { stdio: "inherit" });
  rmSync(`${voiceDir}jobs.json`);
  for (const line of todo) {
    const seconds = Number(execFileSync("afinfo", [`${voiceDir}${line.id}.wav`]).toString().match(/estimated duration: ([\d.]+)/)[1]);
    lengths[line.id] = { seconds, say: line.say, voice: VOICE, speed: SPEED };
  }
  writeFileSync(lengthsFile, JSON.stringify(lengths, null, 2));
}
const total = lines.reduce((sum, l) => sum + lengths[l.id].seconds, 0);
console.log(`Voice for "${name}": ${todo.length} lines spoken now, ${lines.length - todo.length} kept. ${Math.round(total / 60)} minutes of speech.`);
