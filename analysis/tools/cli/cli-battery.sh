#!/bin/bash
# Runs mootant CLI invocations in a fixture and prints, for each one, the exit
# code, the size of stdout and stderr, whether stdout is valid JSON, whether it
# holds ANSI escapes, and the first lines of both streams.
# usage: cli-battery.sh <fixture dir> <cases file>
# Each line of the cases file: <label>|<env assignments or ->|<arguments>
DIR=$1; CASES=$2
BIN="$DIR/node_modules/mootant/bin/mootant.js"
OUT=$(mktemp -d)
cd "$DIR"
while IFS='|' read -r label envs args; do
  [ -z "$label" ] && continue
  case "$label" in \#*) continue;; esac
  [ "$envs" = "-" ] && envs=""
  eval "env $envs timeout 300 node $BIN $args" >"$OUT/o" 2>"$OUT/e" </dev/null
  code=$?
  osz=$(wc -c <"$OUT/o"); esz=$(wc -c <"$OUT/e")
  if [ "$osz" -gt 0 ] && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$OUT/o" 2>/dev/null; then json=valid; elif [ "$osz" -eq 0 ]; then json=empty; else json=no; fi
  ansi_o=$(grep -c $'\x1b\[' "$OUT/o"); ansi_e=$(grep -c $'\x1b\[' "$OUT/e")
  echo "=== [$label] env='$envs' args='$args'"
  echo "exit=$code stdout=${osz}B json=$json ansi(stdout lines)=$ansi_o stderr=${esz}B ansi(stderr lines)=$ansi_e"
  echo "--- stdout (head):"; head -c 600 "$OUT/o" | head -8 | cat -v
  echo "--- stderr (head):"; head -c 900 "$OUT/e" | head -12 | cat -v
done <"$CASES"
rm -rf "$OUT"
