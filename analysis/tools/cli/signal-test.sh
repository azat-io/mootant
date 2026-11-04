#!/bin/bash
# Starts `mootant run src` in a fixture, sends a signal after a delay and
# reports what is left: processes started from the fixture (by command line),
# work directories in the fixture's own TMPDIR, cache temp files, exit status.
# usage: signal-test.sh <fixture dir> <delay s> <signal|none> <pid|group> <plain|tty> [mootant args...]
#   pid   - signal only mootant's main process (as `kill <pid>`, `timeout`,
#           an IDE stop button or `docker stop` of PID 1 do)
#   group - signal the whole process group (as Ctrl+C in a terminal does)
#   tty   - stderr is a pseudo-terminal, so the spinner runs and installs its
#           own SIGINT/SIGTERM listeners
DIR=$1; DELAY=$2; SIG=$3; TARGET=$4; MODE=$5; shift 5
cd "$DIR" || exit 2
rm -rf tmp; mkdir -p tmp; export TMPDIR=$DIR/tmp
unset CI
BIN="node $DIR/node_modules/mootant/bin/mootant.js run src $*"
if [ "$MODE" = tty ]; then
  setsid script -qfec "$BIN" /dev/null >out.txt 2>&1 </dev/null &
else
  setsid $BIN >out.txt 2>err.txt </dev/null &
fi
LEADER=$!
procs() {
  # processes whose command line names the fixture or the sleeps the tests start
  ps -eo pid,ppid,pgid,stat,etimes,args --no-headers |
    awk -v d="$DIR" -v self=$$ '$1 != self && ($0 ~ d || $0 ~ /sleep 41[78]/) && $0 !~ /signal-test|awk|ps -eo/' |
    cut -c1-160
}
sleep "$DELAY"
MPID=$(pgrep -f "^node $DIR/node_modules/mootant/bin/mootant.js" | head -1)
echo "## before signal (t=${DELAY}s): mootant pid=$MPID leader=$LEADER"
procs
if [ "$SIG" != none ]; then
  # group: the process group of mootant, as the terminal driver signals the
  # foreground group on Ctrl+C (under script(1) mootant leads its own group)
  PG=$(ps -o pgid= -p "$MPID" | tr -d ' ')
  if [ "$TARGET" = group ]; then kill -s "$SIG" -- "-$PG"; else kill -s "$SIG" "$MPID"; fi
fi
for i in $(seq 1 60); do kill -0 "$LEADER" 2>/dev/null || break; sleep 0.5; done
wait "$LEADER" 2>/dev/null; CODE=$?
kill -0 "$LEADER" 2>/dev/null && CODE="still-running"
sleep 2
echo "## after: leader exit=$CODE"
LEFT=$(procs)
echo "${LEFT:-<no processes left>}"
echo "## work dirs left in TMPDIR: $(ls tmp | wc -l) $(ls tmp | tr '\n' ' ')"
echo "## files in them: $(find tmp -type f 2>/dev/null | wc -l)"
echo "## cache dir: $(ls node_modules/.cache/mootant 2>/dev/null | tr '\n' ' ')"
echo "## tail of output:"; tail -c 600 out.txt | tr -d '\r' | tail -6; [ -f err.txt ] && tail -c 400 err.txt | tail -4
# clean up whatever is left, the machine is shared
for p in $(echo "$LEFT" | awk '{print $1}'); do kill -KILL "$p" 2>/dev/null; done
pkill -KILL -f "sleep 41[78]" 2>/dev/null
true
