#!/usr/bin/env python3
"""Prints the HIDDEN brought back mutants of a joined experiment with context.

Usage: show_hidden.py JOINED.jsonl SOURCE_ROOT [RULE...]
"""
import json, sys


def main():
    path, root = sys.argv[1], sys.argv[2]
    rules = set(sys.argv[3:])
    texts = {}
    for line in open(path):
        r = json.loads(line)
        if r['class'] != 'HIDDEN' or (rules and r['rule'] not in rules):
            continue
        f = r['file']
        if f not in texts:
            texts[f] = open(f"{root}/{f}", encoding='utf-8').read()
        t = texts[f]
        line_no = t.count('\n', 0, r['start']) + 1
        lines = t.split('\n')
        lo, hi = max(0, line_no - 4), min(len(lines), line_no + 3)
        print(f"=== {r['id']} {r['rule']} ({r['category']}) {f}:{line_no} {r['mutator']}")
        print(f"    {r['original'][:100]!r} -> {r['replacement'][:100]!r}")
        if r.get('by'):
            print(f"    by {r['by']} owners={[(o['mutator'], o['replacement'][:40], o['status']) for o in r['owners']]}")
        print(f"    inside={r['insideStatuses']}")
        for i in range(lo, hi):
            mark = '>>' if i + 1 == line_no else '  '
            print(f"    {mark}{i + 1:4d} {lines[i]}")


if __name__ == '__main__':
    main()
