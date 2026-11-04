#!/usr/bin/env python3
"""Classify skipped candidates of a `mootant list --json --verbose --skipped`
report by how they relate to the mutants Mootant keeps.

For every skipped candidate the mutated file text is computed and compared with
the mutated text of every kept mutant of the same file: `identical` means some
kept mutant produces exactly the same file (the skip cannot lose information),
`owner-kept` means the named owner (`by`) is a kept mutant with a different
file, `owner-skipped` means the owner is not a kept mutant, `no-owner` means the
rule names none.

Usage: classify_owners.py REPORT.json SOURCE_ROOT [OUT.jsonl]
"""
import collections, json, os, sys


def mutate(text16, start, end, replacement):
    return text16[: start * 2] + replacement.encode('utf-16-le') + text16[end * 2 :]


def main():
    report, root = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else None
    data = json.load(open(report))
    texts = {}
    kept_by_file = collections.defaultdict(list)
    for m in data['mutants']:
        kept_by_file[m['file']].append(m)

    def text16(file):
        if file not in texts:
            with open(os.path.join(root, file), encoding='utf-8', newline='') as h:
                texts[file] = h.read().encode('utf-16-le')
        return texts[file]

    mutated_kept = {}
    for file, mutants in kept_by_file.items():
        base = text16(file)
        mutated_kept[file] = {mutate(base, m['start'], m['end'], m['replacement']): m['id'] for m in mutants}
    rows = []
    counts = collections.Counter()
    for s in data['skipped']:
        base = text16(s['file'])
        mutated = mutate(base, s['start'], s['end'], s['replacement'])
        same = mutated_kept.get(s['file'], {}).get(mutated)
        by = s.get('by')
        if same:
            relation = 'identical'
        elif by is None:
            relation = 'no-owner'
        elif by.get('id'):
            relation = 'owner-kept'
        else:
            relation = 'owner-skipped'
        counts[(s['rule'], relation)] += 1
        row = dict(s)
        row['relation'] = relation
        row['identicalTo'] = same
        rows.append(row)
    if out:
        with open(out, 'w') as h:
            for row in rows:
                h.write(json.dumps(row) + '\n')
    by_rule = collections.defaultdict(collections.Counter)
    for (rule, relation), n in counts.items():
        by_rule[rule][relation] += n
    total = collections.Counter()
    for rule, c in sorted(by_rule.items(), key=lambda kv: -sum(kv[1].values())):
        total.update(c)
        print(f"{rule:24s} {sum(c.values()):6d}  " + '  '.join(f"{k}={v}" for k, v in sorted(c.items())))
    print('TOTAL', sum(total.values()), dict(total))


if __name__ == '__main__':
    main()
