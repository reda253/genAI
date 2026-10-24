#!/usr/bin/env bash
# One command: register the Postgres + FX sources, create the four views,
# and verify their numbers. Run from anywhere; the repo root is resolved here.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 zetaris/setup_zetaris.py "$@"
