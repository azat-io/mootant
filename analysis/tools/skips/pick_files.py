#!/usr/bin/env python3
"""Pick a cluster sample of source files for the unskip experiment.

For every major rule, files that contain at least one non-identical skipped
candidate of that rule are drawn at random (seeded) until the rule has at least
MIN_PER_RULE candidates in the sample; files with more than MAX_KEPT kept mutants
are left out to bound the run time.

Usage: pick_files.py CLASSIFIED.jsonl REPORT.json SEED > files.txt
"""
import collections, json, random, sys

MAJOR = {'solitary': 60, 'O3': 30, 'O1': 30, 'O4': 30, 'O19': 30,
         'case-label': 20, 'R2': 30, 'R6': 30, 'R4': 20,
         'comparison-region': 20, 'loop-advance': 15, 'nullish-swap': 15,
         'loop-running': 15, 'lower-bound': 15, 'tail-return': 8}
MAX_KEPT = 80


def main():
    classified, report, seed = sys.argv[1], sys.argv[2], int(sys.argv[3])
    rng = random.Random(seed)
    data = json.load(open(report))
    kept = collections.Counter(m['file'] for m in data['mutants'])
    by_rule_file = collections.defaultdict(collections.Counter)
    for line in open(classified):
        row = json.loads(line)
        if row['relation'] == 'identical':
            continue
        by_rule_file[row['rule']][row['file']] += 1
    chosen = []
    counts = collections.Counter()
    for rule in MAJOR:
        files = [f for f in sorted(by_rule_file[rule]) if kept[f] <= MAX_KEPT]
        rng.shuffle(files)
        for f in files:
            if counts[rule] >= MAJOR[rule]:
                break
            if f in chosen:
                continue
            chosen.append(f)
            for r, c in by_rule_file.items():
                counts[r] += c.get(f, 0)
    # recount exactly
    exact = collections.Counter()
    for r, c in by_rule_file.items():
        for f in chosen:
            exact[r] += c.get(f, 0)
    for f in chosen:
        print(f)
    print('files', len(chosen), 'kept mutants', sum(kept[f] for f in chosen), file=sys.stderr)
    for r in MAJOR:
        print(f'  {r}: {exact[r]}', file=sys.stderr)


if __name__ == '__main__':
    main()
