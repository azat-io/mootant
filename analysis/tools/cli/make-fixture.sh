#!/bin/bash
# Creates a fixture project in /home/user/projects/cli/<name> that reuses the
# node_modules of base-vt (mootant 0.1.0-170ec52 + vitest 5.0.5 + vite 8.3.5)
# through hard links, so each fixture has its own installed copy of mootant.
# usage: make-fixture.sh <name> <vitest|node-test>
set -euo pipefail
NAME=${1:?fixture name}; KIND=${2:?vitest or node-test}
BASE=/home/user/projects/cli/base-vt
DIR=/home/user/projects/cli/$NAME
rm -rf "${DIR:?}"; mkdir -p "$DIR"
cp -al "$BASE/node_modules" "$DIR/node_modules"
if [ "$KIND" = vitest ]; then
  TEST='vitest --run'
  EXTRA=',
    "vite": "^8.3.5",
    "vitest": "5.0.5"'
else
  EXTRA=""
  TEST='node --test'
  # node:test fixtures must not have vitest, or detection picks Vitest
  rm -rf "$DIR/node_modules/vitest" "$DIR/node_modules/.bin/vitest"
fi
cat > "$DIR/package.json" <<JSON
{
  "name": "$NAME",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "$TEST" },
  "devDependencies": {
    "mootant": "file:/home/user/artifacts/mootant-0.1.0-170ec52.tgz"$EXTRA
  }
}
JSON
echo "$DIR"
