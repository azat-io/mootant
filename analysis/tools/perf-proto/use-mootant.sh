#!/usr/bin/env bash
# Swaps the Mootant build installed in a project for another tarball of the same
# version and dependencies (a prototype of analysis/experiments/prototypes.md):
# extracts the tarball over node_modules/mootant (through the symlink for
# pnpm), so the lockfile, the other packages and the resolution of Vitest stay
# as they are. Drops the Mootant cache, whose keys include the build.
# Usage: use-mootant.sh <project-dir> <mootant.tgz>
set -euo pipefail
PROJECT=${1:?project directory}
TGZ=${2:?mootant tarball}
TARGET=$(readlink -f "$PROJECT/node_modules/mootant")
[ -f "$TARGET/package.json" ] || { echo "no mootant in $PROJECT/node_modules" >&2; exit 1; }
TMP=$(mktemp -d)
tar -xzf "$TGZ" -C "$TMP"
old=$(node -p "require('$TARGET/package.json').version")
new=$(node -p "require('$TMP/package/package.json').version")
[ "$old" = "$new" ] || echo "warning: version $old -> $new; dependencies may differ" >&2
find "$TARGET" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
cp -a "$TMP/package/." "$TARGET/"
# npm pack stores every file with the mtime 1985-10-26, and mootant keys its
# cache on the mtime of its own build (core/cache/prepare-run-cache.ts:164):
# give the files the time of this install, as npm install does, so that two
# builds of one version never share cached verdicts.
find "$TARGET" -path "$TARGET/node_modules" -prune -o -type f -exec touch {} +
rm -rf "$TMP" "$PROJECT/node_modules/.cache/mootant"
echo "$PROJECT: mootant <- $TGZ"
