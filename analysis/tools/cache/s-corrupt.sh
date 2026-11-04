#!/usr/bin/env bash
# Damaged, foreign and concurrent cache files, and an interrupted run.
# Usage: s-corrupt.sh <scenario>...

source "$(dirname "$0")/lib.sh"

CACHE_FILE=node_modules/.cache/mootant/run-v3.json

# X1: the cache file is cut off in the middle (a crash of the writer on a
# filesystem without atomic rename, a full disk, a broken CI cache).
truncated() {
  local d
  d=$(new_project corrupt-truncated)
  run_mootant "$d" r1 src
  local size
  size=$(stat -c %s "$d/$CACHE_FILE")
  head -c $((size / 2)) "$d/$CACHE_FILE" >"$d/$CACHE_FILE.cut" && mv "$d/$CACHE_FILE.cut" "$d/$CACHE_FILE"
  run_mootant "$d" r2 src
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log("  cache file is valid JSON again")' "$d/$CACHE_FILE"
  run_mootant "$d" r3 src
}

# X2: entries of valid shape with wrong statuses (a cache file from elsewhere,
# or tampered with): they are trusted.
tampered() {
  local d
  d=$(new_project corrupt-tampered)
  run_mootant "$d" r1 src
  node -e '
    let fs = require("fs"), file = process.argv[1]
    let cache = JSON.parse(fs.readFileSync(file, "utf8"))
    for (let entry of Object.values(cache.entries)) {
      if (entry.status === "Survived") Object.assign(entry, { status: "Killed", message: "tampered", cause: "assertion", test: null })
    }
    fs.writeFileSync(file, JSON.stringify(cache))
  ' "$d/$CACHE_FILE"
  run_mootant "$d" r2 src
}

# X3: the cache path is a directory: nothing is read, the write fails with a
# warning.
directory() {
  local d
  d=$(new_project corrupt-directory)
  mkdir -p "$d/$CACHE_FILE/inner"
  run_mootant "$d" r1 src
}

# X4: two runs at once on the same project.
concurrent() {
  local d
  d=$(new_project corrupt-concurrent)
  (run_mootant "$d" a src >"$DATA_DIR/corrupt-concurrent.a.log" 2>&1) &
  (run_mootant "$d" b src >"$DATA_DIR/corrupt-concurrent.b.log" 2>&1) &
  wait
  cat "$DATA_DIR/corrupt-concurrent.a.log" "$DATA_DIR/corrupt-concurrent.b.log"
  node -e '
    let c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    console.log("  entries after both runs:", Object.keys(c.entries).length)
  ' "$d/$CACHE_FILE"
  ls -la "$d/node_modules/.cache/mootant/" | sed 's/^/    /'
  run_mootant "$d" c src
}

# X5: Ctrl+C in the middle of the mutant runs: what is left in the cache
# directory and in the work directory.
interrupted() {
  local d
  d=$(new_project corrupt-interrupted)
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', async () => {
  await new Promise(resolve => setTimeout(resolve, 1500))
  expect(isAdult(30)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" slow
  local before
  before=$(ls -d /tmp/mootant-* 2>/dev/null | wc -l)
  (cd "$d" && exec ./node_modules/.bin/mootant run src --concurrency 1 >"$DATA_DIR/corrupt-interrupted.r1.out" 2>&1) &
  local pid=$!
  sleep 6
  kill -INT "$pid" 2>/dev/null
  wait "$pid"
  echo "  exit after SIGINT: $?"
  tail -3 "$DATA_DIR/corrupt-interrupted.r1.out" | sed 's/^/    /'
  echo "  cache dir:"
  ls -la "$d/node_modules/.cache/mootant/" 2>&1 | sed 's/^/    /'
  echo "  /tmp/mootant-* dirs before: $before, after: $(ls -d /tmp/mootant-* 2>/dev/null | wc -l)"
  pgrep -af "corrupt-interrupted" | grep -v pgrep | sed 's/^/    left: /'
}

for scenario in "$@"; do
  echo "=== $scenario ($(date -u +%H:%M:%S))"
  "$scenario"
done
