#!/bin/bash
# Compare CLI startup (`mootant --help`) of the preserveModules dist with an esbuild bundle of the same dist.
P=$1; N=${2:-15}
for i in $(seq 1 $N); do
  for v in mootant mootant-bundle; do
    s=$(date +%s%N); node $P/bin/$v.js --help > /dev/null; e=$(date +%s%N)
    echo "$v $(( (e - s) / 1000000 ))"
  done
done
