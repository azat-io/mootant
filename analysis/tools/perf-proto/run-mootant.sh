#!/usr/bin/env bash
# One `mootant run` in a project for the equivalence checks of the prototypes:
# full JSON report (--json --all --verbose) to <out>.json, stderr (progress) to
# <out>.err, wall time and exit code to <out>.time. Extra arguments go to
# `mootant run` after the defaults; set MOOTANT_PARALLEL_UNITS,
# MOOTANT_TRIM_UNITS or MOOTANT_REUSE_DRY_RUN in the environment to turn a
# prototype on.
# Usage: run-mootant.sh <project-dir> <out-prefix> [mootant run args...]
#   default args: src --concurrency 2 --no-cache
set -uo pipefail
PROJECT=${1:?project directory}
OUT=${2:?output prefix}
shift 2
ARGS=("$@")
[ ${#ARGS[@]} -gt 0 ] || ARGS=(src --concurrency 2 --no-cache)
mkdir -p "$(dirname "$OUT")"
export NO_COLOR=1 CI=1
start=$(date +%s.%N)
(cd "$PROJECT" && timeout 3600 nice -n 5 node node_modules/mootant/bin/mootant.js run "${ARGS[@]}" \
  --json --all --verbose >"$OUT.json" 2>"$OUT.err")
code=$?
end=$(date +%s.%N)
printf 'wall=%.2f exit=%d load=%s env=%s args=%s\n' "$(echo "$end - $start" | bc)" "$code" \
  "$(cut -d' ' -f1 /proc/loadavg)" \
  "PARALLEL=${MOOTANT_PARALLEL_UNITS:-} TRIM=${MOOTANT_TRIM_UNITS:-} REUSE=${MOOTANT_REUSE_DRY_RUN:-}" \
  "${ARGS[*]}" | tee "$OUT.time"
