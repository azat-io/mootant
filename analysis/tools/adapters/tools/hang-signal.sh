#!/usr/bin/env bash
# Usage: hang-signal.sh <vitest|node-test> <SIGTERM|SIGHUP>
# Starts mootant on fixture-hang/<variant> with the hanging mutant, signals the
# main process 3 s into the isolated run, then lists processes left with the
# fixture as working directory, and kills them (cleanup) after reporting.
v=$1; sig=$2; root=/home/user/projects/adapters/fixture-hang/$v; out=/home/user/projects/adapters/out/hang-$v-$sig
rm -rf "$out"; mkdir -p "$out/tmp" "$out/trace"
cd "$root"
TMPDIR="$out/tmp" TRACE_DIR="$out/trace" setsid node node_modules/mootant/bin/mootant.js run --config mootant.trace.config.js --mutant ef33xd3qqj1e > "$out/stdout.txt" 2> "$out/stderr.txt" < /dev/null &
pid=$!
for i in $(seq 1 300); do grep -q runIsolated:call "$out/trace/calls.jsonl" 2>/dev/null && break; sleep 0.1; done
sleep 3
kill -s "${sig#SIG}" "$pid"; wait "$pid"; echo "mootant exit=$?"
list() { for p in /proc/[0-9]*; do [ "$(readlink $p/cwd 2>/dev/null)" = "$root" ] && ps -o pid=,ppid=,stat=,etimes=,pcpu=,args= -p ${p#/proc/} 2>/dev/null | grep node | cut -c1-110; done; }
sleep 1; echo "1 s after:"; list
sleep 10; echo "11 s after:"; list
for p in /proc/[0-9]*; do [ "$(readlink $p/cwd 2>/dev/null)" = "$root" ] || continue; case "$(ps -o args= -p ${p#/proc/} 2>/dev/null)" in *node*) kill -KILL ${p#/proc/} 2>/dev/null && echo "cleanup: killed ${p#/proc/}";; esac; done
echo "work dirs left: $(find "$out/tmp" -maxdepth 1 -name 'mootant-*' | wc -l)"
