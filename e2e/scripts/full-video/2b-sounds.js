// Step 2b: makes the phone's sounds for the live scenes (see sounds.js).
//
//   docs/fullvideo/sounds/ring.wav           the alarm chime, exactly as Kamala's app plays it
//   docs/fullvideo/sounds/read-<name>.wav    the phone reading a medicine aloud
//   docs/fullvideo/sounds/lengths.json       how long each one is, in seconds
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sounds, PHONE_VOICE } from "./sounds.js";

const dir = fileURLToPath(new URL("../../../docs/fullvideo/sounds/", import.meta.url));
const speak = fileURLToPath(new URL("../../../tools/voice/speak.js", import.meta.url));
mkdirSync(dir, { recursive: true });

// The same tones as chime() in frontend/elder.js: 880 Hz, 660 Hz, 880 Hz, a third of a second each,
// rising quickly and fading out. The app rings that twice, two seconds apart.
function chimeWav(file) {
  const RATE = 24000;
  const samples = new Float64Array(Math.round(RATE * 2.75));
  for (const round of [0, 2]) {
    for (const [frequency, delay] of [[880, 0], [660, 0.35], [880, 0.7]]) {
      const start = Math.round((round + delay) * RATE);
      for (let i = 0; i < 0.32 * RATE; i++) {
        const t = i / RATE;
        const gain = t < 0.03 ? 0.0001 * (0.5 / 0.0001) ** (t / 0.03) : 0.5 * (0.0001 / 0.5) ** ((t - 0.03) / 0.27);
        samples[start + i] += Math.sin(2 * Math.PI * frequency * t) * Math.min(gain, 0.5);
      }
    }
  }
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * 1.4)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}

// Which voice made each spoken sound last time, so a change of voice remakes them.
const voicesFile = `${dir}voices.json`;
const madeWith = existsSync(voicesFile) ? JSON.parse(readFileSync(voicesFile, "utf8")) : {};
const readVoice = (name) => madeWith[name];

const lengths = {};
for (const [name, sound] of Object.entries(sounds)) {
  const file = `${dir}${name}.wav`;
  if (sound.chime) chimeWav(file);
  else if (!existsSync(file) || readVoice(name) !== PHONE_VOICE) execFileSync(process.execPath, [speak, PHONE_VOICE, file, sound.say], { stdio: "ignore" });
  lengths[name] = Number(execFileSync("afinfo", [file]).toString().match(/estimated duration: ([\d.]+)/)[1]);
}
writeFileSync(`${dir}lengths.json`, JSON.stringify(lengths, null, 2));
writeFileSync(voicesFile, JSON.stringify(Object.fromEntries(Object.entries(sounds).filter(([, s]) => s.say).map(([n]) => [n, PHONE_VOICE])), null, 2));
console.log(`Phone sounds: ${Object.entries(lengths).map(([n, s]) => `${n} ${s.toFixed(1)} s`).join(", ")}`);
