#!/usr/bin/env python3
"""Compact view of `mootant list --json --verbose --skipped` output.

Usage: show.py <report.json> [--file substr] [--line N]
Prints kept mutants (M) and skipped candidates (S) sorted by position.
"""
import json, sys

def main():
    path = sys.argv[1]
    args = sys.argv[2:]
    file_filter = None
    line_filter = None
    if '--file' in args:
        file_filter = args[args.index('--file') + 1]
    if '--line' in args:
        line_filter = int(args[args.index('--line') + 1])
    data = json.load(open(path))
    rows = []
    for m in data.get('mutants', []):
        rows.append((m['file'], m['line'], m.get('column', 0), 'M', m['mutator'],
                     m.get('original', ''), m.get('replacement', ''), m.get('id', ''), ''))
    for s in data.get('skipped', []):
        by = s.get('by')
        bys = ''
        if by:
            bys = f"by {by.get('mutator')}@{by.get('line')}:{by.get('column')} id={by.get('id')}"
        rows.append((s['file'], s['line'], s.get('column', 0), 'S', s['mutator'],
                     s.get('original', ''), s.get('replacement', ''),
                     f"{s['rule']}/{s['category']}{'/H' if s.get('heuristic') else ''}",
                     bys + ' | ' + s.get('reason', '')))
    rows.sort(key=lambda r: (r[0], r[1], r[2], r[3]))
    for r in rows:
        if file_filter and file_filter not in r[0]:
            continue
        if line_filter and r[1] != line_filter:
            continue
        orig = r[5].replace('\n', '\\n')
        repl = r[6].replace('\n', '\\n')
        if len(orig) > 70: orig = orig[:67] + '...'
        if len(repl) > 70: repl = repl[:67] + '...'
        print(f"{r[0]}:{r[1]}:{r[2]} {r[3]} {r[4]:20s} {orig!r} -> {repl!r} [{r[7]}] {r[8]}")

if __name__ == '__main__':
    main()
