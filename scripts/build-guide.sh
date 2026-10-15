#!/bin/bash
# Usage: scripts/build-guide.sh "https://your-app.vercel.app"
set -e
URL="${1:-(add after deployment)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cp -R "$ROOT/docs/img" "$TMP/img"
sed "s#{{LIVE_URL}}#$URL#g" "$ROOT/docs/guide.html" > "$TMP/guide.html"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf="$TMP/guide.pdf" "file://$TMP/guide.html" >/dev/null 2>&1
cp "$TMP/guide.pdf" "$ROOT/docs/Lighthouse_Demo_Guide.pdf"
cp "$TMP/guide.pdf" "$ROOT/../Lighthouse_Demo_Guide.pdf"
echo "PDF: $ROOT/../Lighthouse_Demo_Guide.pdf ($(du -h "$TMP/guide.pdf" | cut -f1))"
