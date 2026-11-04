#!/usr/bin/env bash
# Runs Mootant on a project and saves the full JSON report.
#
# Usage: run-mootant.sh <project-dir> <label> [extra mootant args...]
# Writes <results>/<project-name>/<label>.json and <label>.log, where <results>
# is $ORACLE_RESULTS (default /home/user/projects/oracle/results). Paths to
# mutate default to `src`; pass MOOTANT_PATHS="a b" to change them. The mootant
# binary is the nearest node_modules/.bin/mootant up from the project.
set -u
project=$(cd "$1" && pwd)
label=$2
shift 2
results=${ORACLE_RESULTS:-/home/user/projects/oracle/results}
name=$(basename "$project")
out="$results/$name"
mkdir -p "$out"
bin=""
dir=$project
while [ "$dir" != "/" ]; do
  if [ -x "$dir/node_modules/.bin/mootant" ]; then
    bin="$dir/node_modules/.bin/mootant"
    break
  fi
  dir=$(dirname "$dir")
done
if [ -z "$bin" ]; then
  echo "mootant not found above $project" >&2
  exit 2
fi
cd "$project"
start=$(date +%s.%N)
# shellcheck disable=SC2086
timeout "${MOOTANT_TIMEOUT:-1800}" "$bin" run ${MOOTANT_PATHS:-src} --json --all --verbose --no-cache "$@" \
  >"$out/$label.json" 2>"$out/$label.log"
code=$?
end=$(date +%s.%N)
printf '%s exit=%s seconds=%.1f\n' "$label" "$code" "$(echo "$end - $start" | bc)" | tee -a "$out/runs.txt"
exit 0
