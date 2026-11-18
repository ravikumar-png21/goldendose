// Speaks text with Kokoro, a free open-source voice that runs on this Mac (nothing is sent anywhere).
//
//   node speak.js <voice> <out.wav> "<text>"            one file
//   node speak.js <voice> --list <jobs.json>            many: [{ "out": "a.wav", "text": "…" }, …]
//
// The first run downloads the voice model (about 90 MB) into tools/voice/models/.
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

env.cacheDir = fileURLToPath(new URL("./models/", import.meta.url));
const [voice, second, third] = process.argv.slice(2);
const speed = Number(process.env.SPEED ?? 0.9); // a little slower than normal: calm and clear

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
const jobs = second === "--list" ? JSON.parse(readFileSync(third, "utf8")) : [{ out: second, text: third }];
for (const [i, job] of jobs.entries()) {
  const audio = await tts.generate(job.text, { voice, speed });
  await audio.save(job.out);
  if (jobs.length > 1) process.stdout.write(`\rVoice: ${i + 1} of ${jobs.length}`);
}
if (jobs.length > 1) console.log();
