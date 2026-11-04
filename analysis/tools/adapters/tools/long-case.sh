#!/usr/bin/env bash
# Runs mootant on fixture-long/<variant> (one test that legitimately takes 65 s
# with its own 120 s timeout) and records how the dry run ends.
v=$1; out=/home/user/projects/adapters/out/long-$v
rm -rf "$out"; mkdir -p "$out/tmp"
cd /home/user/projects/adapters/fixture-long/$v
start=$(date +%s)
TMPDIR="$out/tmp" timeout 400 node node_modules/mootant/bin/mootant.js run --mutant fmk4wya45deh > "$out/stdout.txt" 2> "$out/stderr.txt"
echo "exit=$? after $(( $(date +%s) - start )) s" > "$out/result.txt"
tail -5 "$out/stderr.txt" >> "$out/result.txt"
