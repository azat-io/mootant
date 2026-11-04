#!/usr/bin/env python3
"""Physically apply one textual replacement to a file, run a test command, restore.

Usage:
  apply_mutant.py --root DIR --file REL --start N --end N --replacement TEXT \
      [--timeout SEC] -- CMD...

Offsets are UTF-16 code units (as Mootant reports them). Prints a JSON line:
{"status": "killed"|"survived"|"timeout", "exit": code, "seconds": t}
The original file is always restored (also on Ctrl+C).
"""
import argparse, json, os, subprocess, sys, time


def splice_utf16(text, start, end, replacement):
    units = text.encode('utf-16-le')
    before = units[: start * 2].decode('utf-16-le')
    after = units[end * 2 :].decode('utf-16-le')
    original = units[start * 2 : end * 2].decode('utf-16-le')
    return before + replacement + after, original


def main():
    argv = sys.argv[1:]
    if '--' not in argv:
        print('missing -- CMD', file=sys.stderr)
        sys.exit(2)
    split = argv.index('--')
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--file', required=True)
    parser.add_argument('--start', type=int, required=True)
    parser.add_argument('--end', type=int, required=True)
    parser.add_argument('--replacement', required=True)
    parser.add_argument('--expect-original', default=None)
    parser.add_argument('--timeout', type=float, default=60)
    parser.add_argument('--log', default=None)
    args = parser.parse_args(argv[:split])
    cmd = argv[split + 1 :]
    path = os.path.join(args.root, args.file)
    with open(path, encoding='utf-8', newline='') as handle:
        text = handle.read()
    mutated, original = splice_utf16(text, args.start, args.end, args.replacement)
    if args.expect_original is not None and original != args.expect_original:
        print(json.dumps({'status': 'mismatch', 'original': original}))
        sys.exit(3)
    started = time.time()
    status = None
    code = None
    output = ''
    try:
        with open(path, 'w', encoding='utf-8', newline='') as handle:
            handle.write(mutated)
        try:
            result = subprocess.run(
                cmd, cwd=args.root, capture_output=True, text=True,
                timeout=args.timeout, start_new_session=True,
            )
            code = result.returncode
            output = result.stdout + result.stderr
            status = 'survived' if code == 0 else 'killed'
        except subprocess.TimeoutExpired as error:
            status = 'timeout'
            output = (error.stdout or b'').decode() if isinstance(error.stdout, bytes) else (error.stdout or '')
    finally:
        with open(path, 'w', encoding='utf-8', newline='') as handle:
            handle.write(text)
    if args.log:
        with open(args.log, 'w') as handle:
            handle.write(output)
    print(json.dumps({'status': status, 'exit': code,
                      'seconds': round(time.time() - started, 2)}))


if __name__ == '__main__':
    main()
