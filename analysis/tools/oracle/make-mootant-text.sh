#!/usr/bin/env bash
# Builds the "real code" project of the oracle: mootant's own core/ and types/
# from a checkout of 170ec52, with only the tests of core/text and core/tree
# (26 files, 528 tests) and their helpers, as a standalone Vitest project.
#
# Usage: make-mootant-text.sh [checkout] [destination]
# Then: setup-fixtures.sh installs its dependencies, and
#   MOOTANT_PATHS="core/text/blank-outside.ts ..." run-mootant.sh <dest> default
set -eu
checkout=${1:-/home/user/wt/base}
dest=${2:-/home/user/projects/oracle/real/mootant-text}
mkdir -p "$dest/test/core"
cp -r "$checkout/core" "$checkout/types" "$dest/"
cp -r "$checkout/test/core/text" "$checkout/test/core/tree" "$dest/test/core/"
cp -r "$checkout/test/helpers" "$dest/test/"
cat >"$dest/package.json" <<'EOF'
{
  "name": "mootant-text-subject",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" }
}
EOF
cat >"$dest/vitest.config.ts" <<'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
})
EOF
