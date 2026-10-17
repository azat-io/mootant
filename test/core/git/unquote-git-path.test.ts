import { describe, expect, it } from 'vitest'

import { unquoteGitPath } from '../../../core/git/unquote-git-path'

describe('unquoteGitPath', () => {
  it('reads C escapes, octal UTF-8 bytes and plain characters', () => {
    expect(unquoteGitPath(String.raw`"b/a\tb\n\"c\"\\d.ts"`)).toBe(
      'b/a\tb\n"c"\\d.ts',
    )
    expect(unquoteGitPath(String.raw`"b/\303\251t\303\251.ts"`)).toBe(
      'b/été.ts',
    )
    expect(unquoteGitPath(String.raw`"b/\a\b\f\r\v.ts"`)).toBe(
      'b/\u{7}\b\f\r\v.ts',
    )
    expect(unquoteGitPath(String.raw`"b/é😀\q.ts"`)).toBe('b/é😀q.ts')
  })
})
