// Composes gentle background music for the guide video, so there's no copyright question.
//
//   docs/clickguide/video/music.wav   a calm 32-second loop the video repeats underneath the voice
//
// Soft chords (C, A minor, F, G: a warm, familiar progression) held as a slow "pad",
// with a few quiet bell notes on top. Pure maths: sine waves with gentle fades.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outFile = fileURLToPath(new URL("../../../docs/clickguide/video/music.wav", import.meta.url));
const RATE = 22050;
const CHORD_SECONDS = 8;
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Each chord: a low root plus three notes above (MIDI note numbers). Bells: notes from the chord.
const chords = [
  { notes: [48, 60, 64, 67], bells: [72, 76, 79, 76] }, // C
  { notes: [45, 57, 60, 64], bells: [72, 69, 76, 72] }, // A minor
  { notes: [41, 57, 60, 65], bells: [69, 72, 77, 72] }, // F
  { notes: [43, 55, 59, 62], bells: [71, 74, 79, 74] }, // G
];

const length = RATE * CHORD_SECONDS * chords.length;
const mix = new Float64Array(length);

chords.forEach((chord, c) => {
  const start = c * CHORD_SECONDS * RATE;
  // The pad overlaps into the next chord by 2 seconds, so changes are smooth (and the loop joins seamlessly).
  const span = (CHORD_SECONDS + 2) * RATE;
  for (let i = 0; i < span; i++) {
    const t = i / RATE;
    const swell = Math.sin(Math.PI * Math.min(1, t / (CHORD_SECONDS + 2))) ** 2; // fade in and out
    let sample = 0;
    chord.notes.forEach((note, k) => {
      const f = freq(note);
      // Two slightly detuned sines per note give a soft, warm "chorus".
      sample += (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.003 * t)) * (k === 0 ? 0.5 : 0.32);
    });
    mix[(start + i) % length] += sample * swell * 0.18;
  }
  // Quiet bell notes, one every 2 seconds, each fading out slowly.
  chord.bells.forEach((note, b) => {
    const bellStart = start + b * 2 * RATE;
    for (let i = 0; i < 3 * RATE; i++) {
      const t = i / RATE;
      const decay = Math.exp(-t * 1.6) * Math.min(1, t * 40);
      mix[(bellStart + i) % length] += Math.sin(2 * Math.PI * freq(note) * t) * decay * 0.16;
    }
  });
});

// Normalise to a comfortable level, then write a 16-bit mono WAV file.
const peak = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const data = Buffer.alloc(length * 2);
for (let i = 0; i < length; i++) data.writeInt16LE(Math.round((mix[i] / peak) * 0.8 * 32767), i * 2);

const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(data.length, 40);

mkdirSync(fileURLToPath(new URL("../../../docs/clickguide/video/", import.meta.url)), { recursive: true });
writeFileSync(outFile, Buffer.concat([header, data]));
console.log(`Music composed: ${CHORD_SECONDS * chords.length}-second loop in ${outFile}`);
