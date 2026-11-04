#!/usr/bin/env python3
"""Estimates the exposure to BUG-305: lines where a change of that line alone
leaves `--since` with no mutant although the line has skipped candidates whose
owner lies outside the line (so a full run would have tested the behavior
through the owner).

Usage: since_exposure.py REPORT.json SOURCE_ROOT
"""
import bisect, collections, json, sys


def main():
    report, root = sys.argv[1], sys.argv[2]
    data = json.load(open(report))
    starts = {}

    def line_of(f, off):
        if f not in starts:
            u = open(f'{root}/{f}', encoding='utf-8').read()
            arr, pos = [0], 0
            for ch in u:
                pos += 2 if ord(ch) > 0xFFFF else 1
                if ch == '\n':
                    arr.append(pos)
            starts[f] = arr
        return bisect.bisect_right(starts[f], off)

    covered = collections.defaultdict(set)
    for m in data['mutants']:
        a, b = line_of(m['file'], m['start']), line_of(m['file'], max(m['start'], m['end'] - 1))
        for line in range(a, b + 1):
            covered[m['file']].add(line)
    exposed = collections.defaultdict(list)
    for s in data['skipped']:
        by = s.get('by')
        if not by:
            continue
        a, b = line_of(s['file'], s['start']), line_of(s['file'], max(s['start'], s['end'] - 1))
        if a <= by['line'] <= b or a != b:
            continue
        if a not in covered[s['file']]:
            exposed[(s['file'], a)].append(s['rule'])
    rules = collections.Counter(r for v in exposed.values() for r in set(v))
    print('lines with zero mutants under a one-line --since change, though they hold candidates owned from another line:', len(exposed))
    print('  by rule:', dict(rules.most_common()))
    for (f, line), v in list(exposed.items())[:10]:
        print('   ', f, line, v)


if __name__ == '__main__':
    main()
