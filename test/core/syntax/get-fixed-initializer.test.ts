import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getFixedInitializer } from '../../../core/syntax/get-fixed-initializer'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the initializer that always gives the name `n` of a snippet its value.
 *
 * @param source - Snippet that reads `n` in `f(n)`.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns Source text of the initializer, or null.
 */
function readInitializer(source: string, component = false): string | null {
  let file = createTestFile(source)
  let [argument] = file.find('CallExpression', 'f(n)').arguments
  let initializer: Node | null = getFixedInitializer(
    file.scopes,
    new Set(component ? [file.parsed.program] : []),
    file.scopes.bindings.get(argument!)!,
  )
  return initializer ? source.slice(initializer.start, initializer.end) : null
}

describe('getFixedInitializer', () => {
  it.each([
    { source: 'const n = s.length; f(n)', expected: 's.length' },
    { source: 'let n = s.length; f(n)', expected: 's.length' },
    { source: 'export const n = s.length; f(n)', expected: 's.length' },
    { source: 'function g() { let n = 1; f(n) }', expected: '1' },
  ])('finds $expected in $source', ({ expected, source }) => {
    expect(readInitializer(source)).toBe(expected)
  })

  it.each([
    'let n = s.length; n++; f(n)',
    'var n = s.length; f(n)',
    'let n; f(n)',
    'const { n } = s; f(n)',
    'const [n] = s; f(n)',
    'function g(n = 1) { f(n) }',
    'for (const n of s) f(n)',
    'function n() {} f(n)',
    'const n = s.length; eval(code); f(n)',
    'namespace N { export const n = 1; f(n) }',
  ])('finds none in %s', source => {
    expect(readInitializer(source)).toBeNull()
  })

  it('keeps a const of a component and drops a let', () => {
    expect(readInitializer('const n = s.length; f(n)', true)).toBe('s.length')
    expect(readInitializer('let n = s.length; f(n)', true)).toBeNull()
  })
})
