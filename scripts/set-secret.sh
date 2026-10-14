#!/bin/bash
# Usage: copy a key (or a whole .env snippet), then run:  ./scripts/set-secret.sh NAME
# Saves the value from your clipboard into .env.local for that name. Never prints the value.
set -e
NAME="$1"
FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
if [ -z "$NAME" ]; then echo "Tell me which one, e.g. ./scripts/set-secret.sh GEMINI_API_KEY"; exit 1; fi
CLIP="$(pbpaste)"
# If a whole snippet was copied (NAME=... lines), pick out just this NAME's value.
LINE="$(printf '%s\n' "$CLIP" | grep -E "^[[:space:]]*(export[[:space:]]+)?$NAME=" | head -1 || true)"
if [ -n "$LINE" ]; then
  VALUE="${LINE#*=}"
else
  VALUE="$CLIP"
fi
VALUE="$(printf '%s' "$VALUE" | tr -d '[:space:]' | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
if [ -z "$VALUE" ] || [[ "$VALUE" == *"****"* ]]; then
  echo "Nothing usable on your clipboard (or the value was hidden with ****). Click 'Show secret' or 'Copy', then try again."; exit 1
fi
export NAME VALUE
if grep -q "^$NAME=" "$FILE"; then
  awk -F= '$1==ENVIRON["NAME"]{print ENVIRON["NAME"] "=" ENVIRON["VALUE"]; next} {print}' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
  echo "$NAME=$VALUE" >> "$FILE"
fi
chmod 600 "$FILE"
echo "Saved $NAME (${#VALUE} characters, starts with ${VALUE:0:11})."
