#!/bin/bash
# Runs `mootant run src --json --all --no-cache` of a fixture under several
# Node binaries and prints the verdict of every mutant per version, so verdicts
# can be compared across versions.
# usage: node-matrix.sh <fixture dir> <node binary>...
DIR=$1; shift
cd "$DIR" || exit 2
for NODE in "$@"; do
  V=$($NODE --version)
  OUT=$(timeout 300 $NODE node_modules/mootant/bin/mootant.js run src --json --all --no-cache </dev/null 2>/tmp/node-matrix-err.$$)
  CODE=$?
  if [ -z "$OUT" ]; then
    echo "$V exit=$CODE ERROR: $(grep -v '^+' /tmp/node-matrix-err.$$ | head -3 | cut -c1-300 | tr '\n' ' ')"
  else
    echo "$V exit=$CODE $(echo "$OUT" | $NODE -e 'let j=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(j.runner, "score="+j.summary.score, j.mutants.map(m=>m.id.slice(0,4)+":"+m.status).sort().join(" "), j.diagnostics.length ? "diag="+JSON.stringify(j.diagnostics.map(d=>d.code)) : "")')"
  fi
done
rm -f /tmp/node-matrix-err.$$
