#!/usr/bin/env bash
# Joins and summarizes one unskip experiment.
# Usage: analyze_run.sh PREFIX SOURCE_ROOT OUT_DIR
set -euo pipefail
prefix=$1
root=$2
out=$3
tools=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
python3 "$tools/join_verdicts.py" "$prefix.run.json" "$prefix.unskip.jsonl" \
  /home/user/wt/base/core/skips/skip-rules.ts "$out/joined.jsonl" > "$out/join-summary.txt"
python3 "$tools/summarize.py" "$out/joined.jsonl" > "$out/summary.txt"
python3 "$tools/summarize.py" "$out/joined.jsonl" --markdown > "$out/summary.md"
python3 "$tools/show_hidden.py" "$out/joined.jsonl" "$root" > "$out/hidden.txt"
python3 - "$prefix.run.json" "$out/run-summary.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
json.dump(d['summary'], open(sys.argv[2], 'w'), indent=1)
PY
cat "$out/summary.txt"
