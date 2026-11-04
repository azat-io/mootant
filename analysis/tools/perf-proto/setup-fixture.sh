#!/usr/bin/env bash
# Copies a fixture of analysis/experiments/perf-fixtures into a directory
# outside analysis/, installs Vitest 5 (Vitest fixtures) and the given Mootant
# tarball, and makes it a git repository (for --since and a clean state).
# Usage: setup-fixture.sh <fixture> <dest-dir> <mootant.tgz>
# Example:
#   setup-fixture.sh vitest-units /home/user/projects/perf-proto/vitest-units \
#     /home/user/artifacts/mootant-0.1.0-170ec52.tgz
set -euo pipefail
FIXTURE=${1:?fixture name}
DEST=${2:?destination directory}
TGZ=${3:?mootant tarball}
HERE=$(cd "$(dirname "$0")/../.." && pwd)
SRC=$HERE/experiments/perf-fixtures/$FIXTURE
[ -d "$SRC" ] || { echo "no fixture $SRC" >&2; exit 1; }
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$SRC/." "$DEST/"
cd "$DEST"
export npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
if grep -q '"vitest run"' package.json; then
  npm install -D --ignore-scripts --prefer-offline --save-exact vitest@5.1.0 "$TGZ" >/dev/null
else
  npm install -D --ignore-scripts --prefer-offline --save-exact "$TGZ" >/dev/null
fi
printf 'node_modules\ntmp\n' >.gitignore
git init -q
git -c user.name=fixture -c user.email=fixture@localhost add -A
git -c user.name=fixture -c user.email=fixture@localhost commit -qm fixture
echo "$DEST: mootant $(node -p "require('./node_modules/mootant/package.json').version") from $TGZ"
