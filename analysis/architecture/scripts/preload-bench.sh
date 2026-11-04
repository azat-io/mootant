#!/bin/bash
# Module-loading cost of the node:test preload (no unit in env, so it only loads modules).
P=$1; N=${2:-15}
for i in $(seq 1 $N); do
  s=$(date +%s%N); node -e 0; e=$(date +%s%N); echo "plain $(( (e - s) / 1000000 ))"
  s=$(date +%s%N); node --import 'node:test' -e 0; e=$(date +%s%N); echo "node-test-only $(( (e - s) / 1000000 ))"
  s=$(date +%s%N); node --import $P/dist/adapters/node-test/preload/preload.js -e 0; e=$(date +%s%N); echo "preload-dist $(( (e - s) / 1000000 ))"
  s=$(date +%s%N); node --import $P/dist-bundle/preload/preload.js -e 0; e=$(date +%s%N); echo "preload-bundle $(( (e - s) / 1000000 ))"
done
