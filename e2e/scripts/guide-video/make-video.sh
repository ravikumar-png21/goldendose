#!/bin/sh
# Makes the click-by-click guide video with voice-over and soft background music.
# Run from the e2e folder:   sh scripts/guide-video/make-video.sh
#
# To change what the voice says: edit docs/clickguide/video/narration.json, then run this again.
# To change the voice or speed:  VOICE=Daniel RATE=150 sh scripts/guide-video/make-video.sh
set -e
GUIDE="../docs/clickguide"

echo "1/4  Turning the slides into pictures…"
node scripts/guide-video/1-slides-and-script.js

echo "2/4  Recording the voice…"
node scripts/guide-video/2-record-voice.js

echo "3/4  Composing the background music…"
node scripts/guide-video/2b-compose-music.js

echo "4/4  Joining pictures, voice and music into a video…"
swift -suppress-warnings scripts/guide-video/3-make-video.swift "$GUIDE/video/frames" "$GUIDE/video/voice" "$GUIDE/GoldenDose-Click-by-Click.mp4" "$GUIDE/video/music.wav"
