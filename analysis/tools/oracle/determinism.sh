#!/usr/bin/env bash
# Determinism: the same run three times with --no-cache, then once with
# --concurrency 1, each saved as <label>-<n>.json next to the other reports.
#
# Usage: determinism.sh <project-dir> <label> [extra mootant args...]
set -u
here=$(cd "$(dirname "$0")" && pwd)
project=$1
label=$2
shift 2
for run in 1 2 3; do
  "$here/run-mootant.sh" "$project" "$label-$run" "$@"
done
"$here/run-mootant.sh" "$project" "$label-c1" --concurrency 1 "$@"
