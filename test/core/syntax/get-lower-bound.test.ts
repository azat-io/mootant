import { describe, expect, it } from 'vitest'

import { getLowerBound } from '../../../core/syntax/get-lower-bound'
import { createTestFile } from '../../helpers/create-test-file'

describe('getLowerBound', () => {
  it.each([
    { source: 'f(s.length)', expected: 0 },
    { source: 'f(s.size)', expected: null },
    { source: 'f(s.byteLength)', expected: null },
    { source: 'f((s.length as number))', expected: 0 },
    { source: 'f(s.indexOf(x))', expected: -1 },
    { source: 'f(s.lastIndexOf(x))', expected: -1 },
    { source: 'f(s.findIndex(g))', expected: -1 },
    { source: 'f(s.findLastIndex(g))', expected: -1 },
    { source: 'f((s.search)(x))', expected: -1 },
    { source: 'f(s?.length)', expected: null },
    { source: 'f(s?.indexOf(x))', expected: null },
    { source: 'f(s[length])', expected: null },
    { source: 'f(s.count)', expected: null },
    { source: 'f(s.includes(x))', expected: null },
    { source: 'f(s[indexOf](x))', expected: null },
    { source: 'f(indexOf(x))', expected: null },
    { source: 'f(Math.abs(x))', expected: null },
    { source: 'f(1)', expected: null },
  ])('gives $expected for the argument of $source', ({ expected, source }) => {
    let { scopes, find } = createTestFile(source)

    let node = find('CallExpression', source).arguments[0]!

    expect(getLowerBound(scopes, node)).toBe(expected)
  })

  it('gives null for a private length field', () => {
    let { scopes, find } = createTestFile(
      ['class C {', '  #length = 1', '  m() { return this.#length }', '}'].join(
        '\n',
      ),
    )

    expect(getLowerBound(scopes, find('MemberExpression'))).toBeNull()
  })

  it.each([
    { source: "const at = s.indexOf(':'); f(at)", call: 'f(at)', expected: -1 },
    { source: 'let n = s.length; f(n)', call: 'f(n)', expected: 0 },
    {
      source: 'const a = b; const b = s.length; f(a)',
      call: 'f(a)',
      expected: 0,
    },
    {
      source: 'const n = (s.length as number); f((n!))',
      call: 'f((n!))',
      expected: 0,
    },
    { source: 'let n = s.length; n = 1; f(n)', expected: null, call: 'f(n)' },
    { source: 'let n = s.length; n++; f(n)', expected: null, call: 'f(n)' },
    { source: 'var n = s.length; f(n)', expected: null, call: 'f(n)' },
    { source: 'let n; f(n)', expected: null, call: 'f(n)' },
    { source: 'const { length: n } = s; f(n)', expected: null, call: 'f(n)' },
    { source: 'for (const n of s) f(n)', expected: null, call: 'f(n)' },
    {
      source: 'function g(n = s.length) { f(n) }',
      expected: null,
      call: 'f(n)',
    },
    { source: 'const n = b; const b = n; f(n)', expected: null, call: 'f(n)' },
    { source: 'f(n)', expected: null, call: 'f(n)' },
  ])(
    'follows the binding of the argument of f in $source',
    ({ expected, source, call }) => {
      let { scopes, find } = createTestFile(source)

      let [argument] = find('CallExpression', call).arguments

      expect(getLowerBound(scopes, argument!)).toBe(expected)
    },
  )
})
