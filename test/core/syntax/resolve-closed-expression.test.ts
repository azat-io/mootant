import { describe, expect, it, vi } from 'vitest'

import type { ReadCheck } from '../../../types/syntax/read-check'

import { resolveClosedExpression } from '../../../core/syntax/resolve-closed-expression'
import { createTestFile } from '../../helpers/create-test-file'
import { findProbe } from '../../helpers/find-probe'

/**
 * Resolves the argument of the last `f(...)` of a snippet.
 *
 * @param source - Snippet that calls `f` with an argument.
 * @param isAllowedRead - Check of a read of a name.
 * @returns Source text of the expression that the argument resolves to, or
 *   null.
 */
function resolve(source: string, isAllowedRead: ReadCheck): string | null {
  let file = createTestFile(source)
  let value = resolveClosedExpression(
    { scopes: file.scopes, shared: new Set(), tree: file.tree },
    findProbe(file),
    isAllowedRead,
  )
  return value ? source.slice(value.start, value.end) : null
}

describe('resolveClosedExpression', () => {
  it.each([
    { source: 'f((new Map() as M))', expected: 'new Map()' },
    { source: 'const m = (new Map() as M); f(m)', expected: 'new Map()' },
    { source: 'const a = new Map(); const m = a; f(m)', expected: 'a' },
  ])('finds $expected in $source', ({ expected, source }) => {
    expect(resolve(source, () => true)).toBe(expected)
  })

  it.each(['f(m)', 'let m = new Map(); m = other; f(m)'])(
    'finds none in %s',
    source => {
      expect(resolve(source, () => true)).toBeNull()
    },
  )

  it('finds none when a read fails the check', () => {
    expect(resolve('const m = new Map(); f(m)', () => false)).toBeNull()
  })

  it('checks no read for an expression that is not a name', () => {
    let check = vi.fn(() => false)

    expect(resolve('f((new Map() as M))', check)).toBe('new Map()')
    expect(check).not.toHaveBeenCalled()
  })
})
