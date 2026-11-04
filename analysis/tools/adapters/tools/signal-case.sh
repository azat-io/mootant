#!/usr/bin/env bash
# Usage: signal-case.sh <variant: vitest|node-test> <case: tty-ctrl-c|group-int|main-term> <out-dir>
# Starts `mootant run` on fixture-slow/<variant>, interrupts it 1 s after the dry
# run started (a synchronous 5 s loop and a 3 s sleep are running then), and
# reports the exit status, leftover work directories and surviving processes.
set -u
variant=$1; kind=$2; out=$(realpath -m "$3")
root=/home/user/projects/adapters/fixture-slow/$variant
rm -rf "$out"; mkdir -p "$out/tmp" "$out/trace"
export TMPDIR="$out/tmp" TRACE_DIR="$out/trace"
cmd=(node "$root/node_modules/mootant/bin/mootant.js" run --config mootant.trace.config.js)
cd "$root"
case $kind in
  tty-ctrl-c)
    python3 -I /home/user/projects/adapters/tools/ctrl-c.py "$out/trace/calls.jsonl" dryRun:call 1.0 "${cmd[@]}" > "$out/result.txt" 2>&1
    ;;
  group-int|main-term)
    setsid "${cmd[@]}" > "$out/stdout.txt" 2> "$out/stderr.txt" < /dev/null &
    pid=$!
    for i in $(seq 1 300); do grep -q dryRun:call "$out/trace/calls.jsonl" 2>/dev/null && break; sleep 0.1; done
    sleep 1
    if [ "$kind" = group-int ]; then kill -INT -- -"$pid"; else kill -TERM "$pid"; fi
    wait "$pid"; echo "exit=$?" > "$out/result.txt"
    ;;
esac
sleep 0.5
echo "--- processes 0.5 s after exit:" >> "$out/result.txt"
for p in /proc/[0-9]*; do [ "$(readlink $p/cwd 2>/dev/null)" = "$root" ] && ps -o pid=,ppid=,pgid=,stat=,etimes=,args= -p ${p#/proc/} 2>/dev/null | cut -c1-160; done | grep -v -e signal-case -e "ps -o" >> "$out/result.txt"
sleep 6
echo "--- processes 6.5 s after exit:" >> "$out/result.txt"
for p in /proc/[0-9]*; do [ "$(readlink $p/cwd 2>/dev/null)" = "$root" ] && ps -o pid=,ppid=,pgid=,stat=,etimes=,args= -p ${p#/proc/} 2>/dev/null | cut -c1-160; done | grep -v -e signal-case -e "ps -o" >> "$out/result.txt"
echo "--- leftover work directories:" >> "$out/result.txt"
find "$out/tmp" -maxdepth 2 -name 'mootant-*' >> "$out/result.txt"
for d in "$out"/tmp/mootant-*; do [ -d "$d" ] && (cd "$d" && find . -maxdepth 2 | head -20) >> "$out/result.txt"; done
cat "$out/result.txt"
