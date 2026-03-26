#!/bin/bash
cd "$(dirname "$0")"

echo "Starte Celebplayer Standalone..."

# Baue Backend (nur falls nötig, wir machen es hier der Einfachheit halber immer)
cd backend
npm run build

# Starte das Backend
echo "Öffne http://localhost:5000 in deinem Browser."
node dist/index.js
