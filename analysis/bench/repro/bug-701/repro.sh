#!/usr/bin/env bash
# BUG-701: a variable no test reads by name invalidates Mootant's cache for
# every test file that lists process.env (spreads it, starts a child process).
# Usage: repro.sh <empty work dir>   (copies the fixture there, installs, runs)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${1:?work dir}
mkdir -p "$work" && cp -r "$here/src" "$here/test" "$here/package.json" "$work/"
cd "$work"
git init -q
# npm 10.9 fails on vitest 5's optional peers ("reading 'edgesOut'"), hence
# --legacy-peer-deps and an explicit vite.
npm install -D --ignore-scripts --no-audit --no-fund --legacy-peer-deps vitest@5.0.5 vite@8.3.5 >/dev/null
npm install -D --ignore-scripts --no-audit --no-fund "file:${MOOTANT_TGZ:-/home/user/artifacts/mootant-0.1.0-170ec52.tgz}" >/dev/null
run() { node node_modules/mootant/bin/mootant.js run src --json >/dev/null; }
rm -rf node_modules/.cache/mootant
echo "cold, X=1";             X=1 run
echo "warm, X=1 (expected: 5 of 5 reused)"; X=1 run
echo "warm, X=2 (expected: 5 of 5 reused; actual: 1 of 5)"; X=2 run
