#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -n "${CHROME:-}" ]]; then
  browser="$CHROME"
elif command -v google-chrome >/dev/null 2>&1; then
  browser="$(command -v google-chrome)"
elif command -v chromium >/dev/null 2>&1; then
  browser="$(command -v chromium)"
elif command -v chromium-browser >/dev/null 2>&1; then
  browser="$(command -v chromium-browser)"
else
  echo "No Chrome/Chromium found. Set CHROME=/path/to/chrome and retry." >&2
  exit 1
fi

"$browser" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --hide-scrollbars \
  --force-device-scale-factor=1 \
  --virtual-time-budget=15000 \
  --no-pdf-header-footer \
  --print-to-pdf="$PWD/ledger-lens-deck.pdf" \
  "file://$PWD/deck.html"

echo
echo "Wrote $PWD/ledger-lens-deck.pdf"
if command -v pdfinfo >/dev/null 2>&1; then
  pdfinfo "$PWD/ledger-lens-deck.pdf" | grep -E '^(Pages|Page size):'
fi
