#!/usr/bin/env bash
# Isolation experiment: verdicts of a pair of mutants A, B alone, together in
# both orders, in fast mode and with --concurrency 1, plus the full run.
#
# Usage: isolation.sh <project-dir> <tag> <idA> <idB> [extra mootant args...]
# Reports go to $ORACLE_RESULTS/<project>/iso-<tag>-<mode>.json (see
# run-mootant.sh); print them side by side with verdicts.mjs.
set -u
here=$(cd "$(dirname "$0")" && pwd)
project=$1
tag=$2
a=$3
b=$4
shift 4
run() {
  local label=$1
  shift
  "$here/run-mootant.sh" "$project" "iso-$tag-$label" "$@"
}
run A --mutant "$a" "$@"
run B --mutant "$b" "$@"
run AB --mutant "$a" --mutant "$b" "$@"
run BA --mutant "$b" --mutant "$a" "$@"
run AB-fast --mutant "$a" --mutant "$b" --fast "$@"
run AB-c1 --mutant "$a" --mutant "$b" --concurrency 1 "$@"
run AB-fast-c1 --mutant "$a" --mutant "$b" --fast --concurrency 1 "$@"
