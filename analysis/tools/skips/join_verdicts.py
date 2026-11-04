#!/usr/bin/env python3
"""Join the verdicts of an unskip run with the rules that skipped each mutant.

Inputs:
  RUN.json   `mootant run ... --json --all --verbose` of the experiment build
  UNSKIP.jsonl  lines that the experiment build logged (MOOTANT_UNSKIP_LOG)
  CATEGORIES  skip-rules.ts categories (read from SKIP_RULES path)
Output: one JSON line per brought back mutant with its status, the statuses of
its owner(s) and of the kept mutants inside its range, and a classification:

  revealed        the skipped mutant is killed (subsumed, owned, noise rules)
  consistent      an equivalent rule, and the mutant survives
  timeout-confirmed / terminates-killed  a timeout rule, and the mutant times
                  out / ends and is killed
  owner-survives  it survives, and an owner mutant survives as well
  neighbor-survives  no owner, but a kept mutant inside its range survives
  HIDDEN          it survives while every owner (or every kept mutant inside its
                  range when the rule names no owner) is killed: the test suite
                  passes Mootant's report but not this mutant
  not-equivalent  the rule claims equivalence and the mutant is killed

Usage: join_verdicts.py RUN.json UNSKIP.jsonl SKIP_RULES.ts OUT.jsonl
"""
import collections, json, re, sys

KILLED = {'Killed', 'Timeout', 'Error'}
ALIVE = {'Survived', 'NoCoverage'}


def read_categories(path):
    text = open(path).read()
    categories = {}
    for match in re.finditer(r"'?([\w-]+)'?:\s*\{\s*category:\s*'(\w+)',\s*heuristic:\s*(true|false)", text):
        categories[match.group(1)] = (match.group(2), match.group(3) == 'true')
    return categories


def main():
    run_path, log_path, rules_path, out_path = sys.argv[1:5]
    categories = read_categories(rules_path)
    run = json.load(open(run_path))
    mutants = run['mutants']
    status = {m['id']: m['status'] for m in mutants}
    by_file = collections.defaultdict(list)
    for m in mutants:
        by_file[m['file']].append(m)
    logged = {}
    for line in open(log_path):
        row = json.loads(line)
        logged[row['id']] = row
    unskipped_ids = set(logged)
    out = open(out_path, 'w')
    summary = collections.defaultdict(collections.Counter)
    for uid, row in logged.items():
        if uid not in status:
            continue
        st = status[uid]
        file = row['file']
        kept = [m for m in by_file[file] if m['id'] not in unskipped_ids]
        owners = []
        by = row.get('by')
        if by:
            if by.get('id'):
                owners = [m for m in kept if m['id'] == by['id']]
            else:
                owners = [m for m in kept if m['mutator'] == by['mutator']
                          and m['start'] == by['start'] and m['end'] == by['end']]
        inside = [m for m in kept if row['start'] <= m['start'] and m['end'] <= row['end']
                  and not (m['start'] == row['start'] and m['end'] == row['end'] and m['replacement'] == row['replacement'])]
        category, heuristic = categories.get(row['rule'], ('?', None))
        owner_alive = any(o['status'] in ALIVE for o in owners)
        inside_alive = any(m['status'] in ALIVE for m in inside)
        if category == 'equivalent':
            if st == 'Killed':
                cls = 'not-equivalent'
            elif st in ALIVE:
                cls = 'consistent'
            else:
                cls = 'other:' + st
        elif category == 'timeout':
            if st == 'Timeout':
                cls = 'timeout-confirmed'
            elif st == 'Killed' or st == 'Error':
                cls = 'terminates-killed'
            elif st in ALIVE:
                cls = 'neighbor-survives' if inside_alive else 'HIDDEN'
            else:
                cls = 'other:' + st
        elif st in KILLED:
            cls = 'revealed'
        elif st in ALIVE:
            if owners:
                cls = 'owner-survives' if owner_alive else 'HIDDEN'
            else:
                cls = 'neighbor-survives' if inside_alive else 'HIDDEN'
        else:
            cls = 'other:' + st
        record = dict(row)
        record.update({
            'status': st,
            'category': category,
            'ruleHeuristic': heuristic,
            'owners': [{'id': o['id'], 'status': o['status'], 'replacement': o['replacement'],
                        'mutator': o['mutator']} for o in owners],
            'insideStatuses': collections.Counter(m['status'] for m in inside),
            'class': cls,
        })
        out.write(json.dumps(record) + '\n')
        summary[row['rule']][cls] += 1
    for rule, counter in sorted(summary.items(), key=lambda kv: -sum(kv[1].values())):
        total = sum(counter.values())
        print(f"{rule:24s} n={total:4d}  " + '  '.join(f"{k}={v}" for k, v in sorted(counter.items())))


if __name__ == '__main__':
    main()
