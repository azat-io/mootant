#!/usr/bin/env bash
# Runs Mootant (default and --fast) and the oracle on several fixtures.
#
# Usage: run-suite.sh <family: vt|nt> <fixture>...
# For vt the oracle command is Vitest with the dot and JSON reporters and one
# worker per run; for nt it is the fixture's `npm test` command with the TAP
# reporter (ORACLE_CMD overrides it). Extra Mootant args: MOOTANT_ARGS.
set -u
here=$(cd "$(dirname "$0")" && pwd)
family=$1
shift
root=${ORACLE_ROOT:-/home/user/projects/oracle}
results=${ORACLE_RESULTS:-$root/results}
for fixture in "$@"; do
  project="$root/$family/$fixture"
  out="$results/$fixture"
  mkdir -p "$out"
  # shellcheck disable=SC2086
  "$here/run-mootant.sh" "$project" default ${MOOTANT_ARGS:-}
  if [ "$family" = vt ]; then
    # shellcheck disable=SC2086
    "$here/run-mootant.sh" "$project" fast --fast ${MOOTANT_ARGS:-}
    cmd=${ORACLE_CMD:-"node $root/vt/node_modules/vitest/vitest.mjs run --reporter=dot --reporter=json --outputFile.json={json} --maxWorkers=1"}
  else
    script=$(node -p "require('$project/package.json').scripts.test")
    cmd=${ORACLE_CMD:-"$script --test-reporter=tap"}
  fi
  node "$here/oracle.mjs" --project "$project" --report "$out/default.json" \
    --out "$out/oracle.jsonl" --workers "${ORACLE_WORKERS:-2}" --cmd "$cmd" \
    >"$out/oracle.log" 2>&1
  echo "$fixture oracle exit=$?"
done
