#!/usr/bin/env python3
"""Per-rule table of an unskip experiment (output of join_verdicts.py).

Prints, for every rule, the number of brought back mutants with a verdict, how
many were killed or timed out, how many survived while an owner survived, how
many are HIDDEN (survived while every owner / every kept mutant inside was
killed), and the HIDDEN share with a 95% Wilson interval. Mutants without a
verdict (Ignored, errors of the run) are left out.

Usage: summarize.py JOINED.jsonl [--markdown]
"""
import collections, json, math, sys


def wilson(x, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = x / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def main():
    path = sys.argv[1]
    markdown = '--markdown' in sys.argv
    rows = collections.defaultdict(collections.Counter)
    category = {}
    for line in open(path):
        r = json.loads(line)
        if r['status'] in ('Ignored',):
            continue
        rows[r['rule']][r['class']] += 1
        category[r['rule']] = r['category']
    order = sorted(rows, key=lambda k: -sum(rows[k].values()))
    if markdown:
        print('| Правило | Категория | n | убит/таймаут | выжил вместе с владельцем/соседом | HIDDEN | доля HIDDEN (95% ДИ) |')
        print('| --- | --- | ---: | ---: | ---: | ---: | --- |')
    for rule in order:
        c = rows[rule]
        n = sum(c.values())
        hidden = c['HIDDEN']
        killed = c['revealed'] + c['timeout-confirmed'] + c['terminates-killed'] + c['not-equivalent']
        alive_with = c['owner-survives'] + c['neighbor-survives'] + c['consistent']
        lo, hi = wilson(hidden, n)
        if markdown:
            print(f"| {rule} | {category[rule]} | {n} | {killed} | {alive_with} | {hidden} | {hidden / n:.0%} ({lo:.0%}–{hi:.0%}) |")
        else:
            extra = ' '.join(f'{k}={v}' for k, v in sorted(c.items()))
            print(f"{rule:22s} {category[rule]:10s} n={n:4d} hidden={hidden:3d} {hidden / n:6.1%} [{lo:.1%},{hi:.1%}]  {extra}")


if __name__ == '__main__':
    main()
