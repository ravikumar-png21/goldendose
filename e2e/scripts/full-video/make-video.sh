#!/bin/sh
# Makes a GoldenDose video, narrated by Bella (Kokoro, a free voice that runs on this Mac).
# Run from the e2e folder:
#
#   npm run full-video -- full    Why GoldenDose, the live first-time tour, then every click
#   npm run full-video -- live    Why GoldenDose, the live first-time tour, then more things you can do (all live)
#
# What's in each video, and every word, is in scripts/full-video/lines.js.
set -e
VIDEO="${1:-full}"
OUT="../docs/fullvideo"
FILE=$(node -e "import('./scripts/full-video/lines.js').then(m => console.log(m.videos['$VIDEO']?.file ?? ''))")
[ -n "$FILE" ] || { echo "No video called \"$VIDEO\". Try: full, live"; exit 1; }

echo "1/6  Making the slide pictures…"
node scripts/full-video/1-make-pictures.js "$VIDEO"

echo "2/6  Recording the voice (only new or changed lines)…"
node scripts/full-video/2-voice.js "$VIDEO"

echo "     …and the phone's own sounds (alarm chime, reading aloud)"
node scripts/full-video/2b-sounds.js

echo "3/6  Filming the live scenes in the real apps…"
node scripts/full-video/3-film.js "$VIDEO"

echo "4/6  Putting everything in order…"
node scripts/full-video/4-make-plan.js "$VIDEO"

echo "5/6  Composing the background music…"
node scripts/guide-video/2b-compose-music.js

echo "6/6  Joining pictures, voice and music into a video…"
swift -suppress-warnings scripts/full-video/5-make-video.swift "$OUT/plan-$VIDEO.json" "$OUT/$FILE" "../docs/clickguide/video/music.wav"
