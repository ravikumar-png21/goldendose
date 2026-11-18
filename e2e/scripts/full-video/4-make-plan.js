// Step 4: lists every picture in order, how long it stays on screen, which voice starts with it,
// and how it moves: still slides zoom in slowly, and every new line fades in from the one before.
//
//   node 4-make-plan.js <video>
//   docs/fullvideo/plan-<video>.json   read by 5-make-video.swift: { shots: [...], sounds: [{ file, at }] }
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chosenVideo } from "./lines.js";

const { name, lines } = chosenVideo();
const out = fileURLToPath(new URL("../../../docs/fullvideo/", import.meta.url));
const lengths = JSON.parse(readFileSync(`${out}voice/lengths.json`, "utf8"));
const GAP = 0.8;
const FPS = 30;

const timelines = {};
const timeline = (film) => {
  const file = `${out}live/${film}/timeline.json`;
  if (!existsSync(file)) throw new Error(`The "${film}" scenes haven't been filmed yet. Run 3-film.js ${name}.`);
  return (timelines[film] ??= JSON.parse(readFileSync(file, "utf8")));
};

const plan = [];
const phoneSounds = []; // the alarm chime and the phone reading aloud, at their moment in the video
let clock = 0;
for (const line of lines) {
  const voice = `${out}voice/${line.id}.wav`;
  const speech = lengths[line.id].seconds;
  if (!line.picture.live) {
    plan.push({ image: `${out}frames/${line.id}.png`, seconds: speech + GAP, voice, zoom: true, fade: true });
    clock += speech + GAP;
    continue;
  }
  const live = timeline(line.picture.film);
  const scene = live.scenes.find((s) => s.id === line.id);
  if (!scene) throw new Error(`The "${line.picture.film}" film has no scene "${line.id}". Run 3-film.js ${name} again.`);
  // The picture on screen when the scene began, then every change until it ended, on a 30-a-second grid.
  const before = live.frames.filter((f) => f.t <= scene.start).pop() ?? live.frames[0];
  const during = live.frames.filter((f) => f.t > scene.start && f.t < scene.end).sort((a, b) => a.t - b.t); // Chrome now and then sends one late
  const shots = [];
  for (const f of [{ ...before, t: scene.start }, ...during]) {
    const at = Math.round((f.t - scene.start) * FPS) / FPS;
    if (shots.length && shots.at(-1).at === at) shots.at(-1).file = f.file; // two in the same instant: keep the later
    else shots.push({ at, file: f.file });
  }
  // If the words were changed after filming and are now longer, hold the last picture until they finish.
  const voiceAt = scene.voiceAt ?? 0;
  const total = Math.max(scene.end - scene.start, voiceAt + speech + GAP);
  for (const s of scene.sounds ?? []) phoneSounds.push({ file: `${out}sounds/${s.name}.wav`, at: clock + s.at });
  // Rounding to the 30-a-second grid can put the very last picture just past the end: leave it out.
  while (shots.length > 1 && shots.at(-1).at >= total - 0.001) shots.pop();
  shots.forEach((s, i) => {
    const next = i + 1 < shots.length ? shots[i + 1].at : total;
    plan.push({ image: `${out}live/${line.picture.film}/${s.file}`, seconds: next - s.at, ...(i === 0 ? { voice, voiceAt, fade: true } : {}) });
  });
  clock += total;
}
writeFileSync(`${out}plan-${name}.json`, JSON.stringify({ shots: plan, sounds: phoneSounds }));
const minutes = plan.reduce((a, p) => a + p.seconds, 0) / 60;
console.log(`Plan for "${name}": ${plan.length} pictures, ${phoneSounds.length} phone sounds, ${minutes.toFixed(1)} minutes.`);
