import { describe, expect, it } from 'vitest'

import { parseUnifiedDiff } from '../../../core/git/parse-unified-diff'

/**
 * Parses a diff given as lines and lists the changed lines of each file.
 *
 * @param lines - Lines of the diff.
 * @returns Sorted changed lines by path.
 */
function parse(lines: string[]): Record<string, number[]> {
  return Object.fromEntries(
    [...parseUnifiedDiff(lines.join('\n'))].map(([file, changed]) => [
      file,
      [...changed].toSorted((left, right) => left - right),
    ]),
  )
}

describe('parseUnifiedDiff', () => {
  it('marks added and changed lines, a count left out being 1', () => {
    expect(
      parse([
        'diff --git a/src/math.ts b/src/math.ts',
        'index 1111111..2222222 100644',
        '--- a/src/math.ts',
        '+++ b/src/math.ts',
        '@@ -2 +2 @@ export function add(a, b) {',
        '-  return a - b',
        '+  return a + b',
        '@@ -10,0 +11,3 @@',
        '+one',
        '+two',
        '+three',
        '',
      ]),
    ).toStrictEqual({ 'src/math.ts': [2, 11, 12, 13] })
  })

  it('marks every line of an added file', () => {
    expect(
      parse([
        'diff --git a/new.ts b/new.ts',
        'new file mode 100644',
        'index 0000000..3333333',
        '--- /dev/null',
        '+++ b/new.ts',
        '@@ -0,0 +1,2 @@',
        '+let a = 1',
        '+let b = 2',
      ]),
    ).toStrictEqual({ 'new.ts': [1, 2] })
  })

  it('marks the lines around a removal at the top, in the middle and at the end', () => {
    expect(
      parse([
        '--- a/top.ts',
        '+++ b/top.ts',
        '@@ -1,2 +0,0 @@',
        '-one',
        '-two',
        '--- a/middle.ts',
        '+++ b/middle.ts',
        '@@ -5 +4,0 @@',
        '-five',
        '--- a/end.ts',
        '+++ b/end.ts',
        '@@ -9,2 +8,0 @@',
        '-nine',
        '-ten',
        String.raw`\ No newline at end of file`,
      ]),
    ).toStrictEqual({
      'middle.ts': [4, 5],
      'end.ts': [8, 9],
      'top.ts': [1],
    })
  })

  it('never reads changed lines as headers', () => {
    expect(
      parse([
        '--- a/tricky.ts',
        '+++ b/tricky.ts',
        '@@ -1,2 +1,2 @@',
        '---- a/x',
        String.raw`\ No newline at end of file`,
        '-@@ -1 +1 @@',
        '++++ b/other.ts',
        '+@@ -7 +7 @@',
      ]),
    ).toStrictEqual({ 'tricky.ts': [1, 2] })
  })

  it('reads renamed, quoted and spaced paths, and skips files without hunks', () => {
    expect(
      parse([
        'diff --git a/old.ts b/moved.ts',
        'similarity index 100%',
        'rename from old.ts',
        'rename to moved.ts',
        'diff --git a/before.ts b/after.ts',
        'similarity index 90%',
        'rename from before.ts',
        'rename to after.ts',
        '--- a/before.ts',
        '+++ b/after.ts',
        '@@ -3 +3 @@',
        '-a',
        '+b',
        'diff --git a/logo.png b/logo.png',
        'Binary files a/logo.png and b/logo.png differ',
        '--- a/my file.ts\t',
        '+++ b/my file.ts\t',
        '@@ -1 +1 @@',
        '-a',
        '+b',
        String.raw`--- "a/tab\there.ts"`,
        String.raw`+++ "b/tab\there.ts"`,
        '@@ -1 +1 @@',
        '-a',
        '+b',
        '--- a/été.ts',
        '+++ b/été.ts',
        '@@ -2 +2 @@',
        '-a\r',
        '+b\r',
      ]),
    ).toStrictEqual({
      'tab\there.ts': [1],
      'my file.ts': [1],
      'after.ts': [3],
      'été.ts': [2],
    })
  })

  it('reads an empty diff', () => {
    expect(parse([''])).toStrictEqual({})
  })
})
