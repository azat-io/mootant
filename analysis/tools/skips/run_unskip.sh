#!/usr/bin/env bash
# Runs the experiment build of Mootant (worktree experiment/skips, patch
# analysis/experiments/skips-unskip.diff) with every skipped candidate brought
# back as a mutant, on a list of files, and writes the run report and the log
# of brought back mutants.
#
# Usage: run_unskip.sh PROJECT_DIR FILES_LIST OUT_PREFIX [MOOTANT_CMD...]
set -euo pipefail
project=$1
files=$2
out=$3
shift 3
cmd=("$@")
if [ ${#cmd[@]} -eq 0 ]; then
  cmd=(npx mootant)
fi
rm -f "$out.unskip.jsonl"
cd "$project"
export MOOTANT_UNSKIP=all
export MOOTANT_UNSKIP_LOG="$out.unskip.jsonl"
start=$(date +%s)
# shellcheck disable=SC2046
nice -n 10 timeout 7000 "${cmd[@]}" run $(cat "$files") --no-cache --json --all --verbose --concurrency 2 \
  > "$out.run.json" 2> "$out.run.err" || echo "exit $?" >> "$out.run.err"
echo "seconds $(( $(date +%s) - start ))" >> "$out.run.err"
