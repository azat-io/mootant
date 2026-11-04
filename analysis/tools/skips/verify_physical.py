#!/usr/bin/env python3
"""Physically re-checks brought back mutants of an unskip experiment.

For every selected mutant, the replacement is written into a separate checkout
of the project (not the one Mootant instruments), the test files that the run
used for the mutant (`testFiles` of the run report) are run with the plain test
runner, and the original text is restored. A mutant that the plain run does not
kill is confirmed as surviving without Mootant's instrumentation.

Usage: verify_physical.py JOINED.jsonl RUN.json CHECKOUT OUT.jsonl \
          [--class HIDDEN] [--rule R ...] [--all-tests GLOB] -- CMD...
CMD is the test command; the test files are appended to it.
"""
import argparse, json, os, signal, subprocess, sys, time

sys.path.insert(0, os.path.dirname(__file__))
from apply_mutant import splice_utf16  # noqa: E402


def main():
    argv = sys.argv[1:]
    split = argv.index('--')
    parser = argparse.ArgumentParser()
    parser.add_argument('joined')
    parser.add_argument('run')
    parser.add_argument('checkout')
    parser.add_argument('out')
    parser.add_argument('--class', dest='klass', default='HIDDEN')
    parser.add_argument('--rule', action='append', default=[])
    parser.add_argument('--ids', default=None)
    parser.add_argument('--timeout', type=float, default=300)
    parser.add_argument('--no-files', action='store_true',
                        help='run CMD without appending the test files')
    args = parser.parse_args(argv[:split])
    cmd = argv[split + 1:]
    run = {m['id']: m for m in json.load(open(args.run))['mutants']}
    ids = set(open(args.ids).read().split()) if args.ids else None
    done = set()
    if os.path.exists(args.out):
        for line in open(args.out):
            done.add(json.loads(line)['id'])
    out = open(args.out, 'a')
    for line in open(args.joined):
        r = json.loads(line)
        if ids is not None:
            if r['id'] not in ids:
                continue
        elif r['class'] != args.klass or (args.rule and r['rule'] not in args.rule):
            continue
        if r['id'] in done:
            continue
        m = run.get(r['id']) or {}
        files = sorted(m.get('testFiles') or {})
        if not files and m.get('killedIn'):
            files = [m['killedIn']]
        if not files:
            out.write(json.dumps({'id': r['id'], 'status': 'no-test-files'}) + '\n')
            continue
        path = os.path.join(args.checkout, r['file'])
        with open(path, encoding='utf-8', newline='') as handle:
            text = handle.read()
        mutated, original = splice_utf16(text, r['start'], r['end'], r['replacement'])
        if original != r['original']:
            out.write(json.dumps({'id': r['id'], 'status': 'mismatch'}) + '\n')
            continue
        started = time.time()

        def restore(*_):
            with open(path, 'w', encoding='utf-8', newline='') as handle:
                handle.write(text)
            sys.exit(130)

        signal.signal(signal.SIGTERM, restore)
        signal.signal(signal.SIGINT, restore)
        try:
            with open(path, 'w', encoding='utf-8', newline='') as handle:
                handle.write(mutated)
            full = cmd if args.no_files else cmd + files
            try:
                result = subprocess.run(full, cwd=args.checkout, capture_output=True,
                                        text=True, timeout=args.timeout, start_new_session=True)
                status = 'survived' if result.returncode == 0 else 'killed'
                tail = (result.stdout + result.stderr)[-400:]
            except subprocess.TimeoutExpired:
                status, tail = 'timeout', ''
        finally:
            with open(path, 'w', encoding='utf-8', newline='') as handle:
                handle.write(text)
        record = {'id': r['id'], 'rule': r['rule'], 'file': r['file'], 'status': status,
                  'tests': files, 'seconds': round(time.time() - started, 1),
                  'tail': tail if status != 'survived' else ''}
        out.write(json.dumps(record) + '\n')
        out.flush()
        print(record['id'], record['rule'], status, record['seconds'], flush=True)


if __name__ == '__main__':
    main()
