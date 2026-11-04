#!/usr/bin/env bash
# Regenerates every number of analysis/01-architecture.md from the sources.
# Read-only for the repository: writes only into analysis/architecture/data.
#
# Needs the tools outside the repository:
#   npm i --prefix /home/user/tools-arch dependency-cruiser madge typescript@5 \
#     oxc-parser@0.156.0 jscpd@4 @hpcc-js/wasm-graphviz esbuild@0.25
#
# Usage, from the repository root:
#   bash analysis/architecture/scripts/run-all.sh
set -euo pipefail

TOOLS=${TOOLS:-/home/user/tools-arch/node_modules/.bin}
A=analysis/architecture
D=$A/data
mkdir -p "$D"

# 1. Import graphs of the sources and of the tests.
"$TOOLS/depcruise" --config $A/scripts/depcruise.config.cjs \
  --output-type json core adapters cli types > "$D/depcruise.json" || true
"$TOOLS/depcruise" --config $A/scripts/depcruise-tests.config.cjs \
  --output-type json test > "$D/depcruise-tests.json"

# 2. Aggregates: fan-in/out, folders, single importers, SCC, reach, Mermaid.
node $A/scripts/analyze-graph.mjs "$D/depcruise.json" "$D" > /dev/null
node $A/scripts/code-style-metrics.mjs "$D" > /dev/null
node $A/scripts/helper-folders.mjs "$D" > /dev/null
node $A/scripts/mermaid-views.mjs "$D" > /dev/null
EXTENDED=1 node $A/scripts/simulate-grouping.mjs "$D" > /dev/null
mv "$D/grouping-simulation.json" "$D/grouping-simulation-extended.json"
mv "$D/grouping-map.tsv" "$D/grouping-map-extended.tsv"
node $A/scripts/simulate-grouping.mjs "$D" > /dev/null
node $A/scripts/extra-metrics.mjs "$D" > /dev/null
node $A/scripts/facade-closures.mjs "$D" > /dev/null

# 3. Folder graphs as SVG (dot rendered by Graphviz compiled to wasm).
"$TOOLS/depcruise" --config $A/scripts/depcruise.config.cjs --output-type archi \
  --collapse '^(core|adapters|cli|types)/[^/]+' core adapters cli types \
  > "$D/folders-archi.dot" 2> /dev/null || true
"$TOOLS/depcruise" --config $A/scripts/depcruise.config.cjs --output-type archi \
  --collapse '^(core|adapters|cli)/[^/]+' --include-only '^(core|adapters|cli)/' \
  core adapters cli > "$D/folders-src-archi.dot" 2> /dev/null || true
node $A/scripts/dot-to-svg.mjs "$D/folders-archi.dot" $A/folders-archi.svg
node $A/scripts/dot-to-svg.mjs "$D/folders-src-archi.dot" $A/folders-src-archi.svg

# 4. Copy-paste detection; only a summary of the clones is kept.
"$TOOLS/jscpd" --min-tokens 50 --min-lines 6 --format typescript --reporters json \
  --output "$D/.jscpd-strict" --silent --ignore "**/*.d.ts" core adapters cli
"$TOOLS/jscpd" --min-tokens 35 --min-lines 4 --mode weak --format typescript \
  --reporters json --output "$D/.jscpd-weak" --silent --ignore "**/*.d.ts" core adapters cli
node -e '
let fs = require("fs")
let read = mode => {
  let report = JSON.parse(fs.readFileSync(process.argv[1] + "/.jscpd-" + mode + "/jscpd-report.json", "utf8"))
  return {
    total: report.statistics.total,
    clones: report.duplicates.map(d => ({
      lines: d.lines,
      tokens: d.tokens,
      first: d.firstFile.name + ":" + d.firstFile.start + "-" + d.firstFile.end,
      second: d.secondFile.name + ":" + d.secondFile.start + "-" + d.secondFile.end,
    })),
  }
}
let summary = { strict: read("strict"), weak: read("weak") }
fs.writeFileSync(process.argv[1] + "/jscpd-summary.json", JSON.stringify(summary, null, 2) + "\n")
' "$D"
rm -rf "$D/.jscpd-strict" "$D/.jscpd-weak"

# 5. Snapshots of the big graphs are kept compressed.
gzip -kf "$D/depcruise.json" "$D/depcruise-tests.json"

# 6. Project formatting for the JSON files, when the project's Prettier exists.
if [ -x node_modules/.bin/prettier ]; then
  node_modules/.bin/prettier --write "$D"/*.json > /dev/null
fi
echo done
