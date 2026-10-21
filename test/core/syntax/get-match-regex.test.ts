import { describe, expect, it, vi } from 'vitest'

import type { AnalyzedProgram } from '../../../types/syntax/analyzed-program'

import { getMatchRegex } from '../../../core/syntax/get-match-regex'
import { createTestFile } from '../../helpers/create-test-file'
import { findProbe } from '../../helpers/find-probe'

/**
 * Reads the regular expression that the argument of the last `f(...)` of a
 * snippet runs.
 *
 * @param source - Snippet that calls `f`.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The method of the call and the text of the literal, or null.
 */
function read(
  source: string,
  component = false,
): { literal: string; method: string } | null {
  let file = createTestFile(source)
  let program: AnalyzedProgram = {
    shared: new Set(component ? [file.parsed.program] : []),
    scopes: file.scopes,
    tree: file.tree,
  }
  let match = getMatchRegex(program, findProbe(file))
  return (
    match && {
      literal: source.slice(match.literal.start, match.literal.end),
      method: match.method,
    }
  )
}

describe('getMatchRegex', () => {
  it.each([
    {
      expected: { literal: '/a+/u', method: 'exec' },
      source: 'f(/a+/u.exec(s))',
    },
    {
      expected: { literal: '/a+/gu', method: 'exec' },
      source: 'f((/a+/gu as RegExp).exec(s))',
    },
    {
      expected: { literal: '/a+/u', method: 'exec' },
      source: 'const re = /a+/u; f(re.exec(s))',
    },
    {
      expected: { literal: '/a+/u', method: 'exec' },
      source: 'let re = /a+/u; f(re?.exec(s))',
    },
    {
      expected: { literal: '/b/u', method: 'match' },
      source: 'f(s.match(/b/u))',
    },
    {
      expected: { literal: '/b/gu', method: 'match' },
      source: 'const re = /b/gu; f(s?.match(re))',
    },
    {
      expected: { literal: '/b/u', method: 'match' },
      source: 'f((s.match(/b/u)!))',
    },
    {
      source:
        "const re = /a/gu; s.replace(re, ''); t.replaceAll(re, ''); u.split(re); f(re.exec(s))",
      expected: { literal: '/a/gu', method: 'exec' },
    },
    {
      source:
        'const re = /b/gu; s.search(re); t.matchAll(re); (re as RegExp).test(t); f(u.match(re))',
      expected: { literal: '/b/gu', method: 'match' },
    },
  ])('reads $expected.literal in $source', ({ expected, source }) => {
    expect(read(source)).toStrictEqual(expected)
  })

  it.each([
    'f(s.search(/a/u))',
    'f(s.replace(/a/u, b))',
    'f(s.match(/a/u, b))',
    'f(s.match(...patterns))',
    'f(s.match(pattern))',
    'f(s.match("a"))',
    'f(re.exec(s))',
    'f(this.re.exec(s))',
    'f(/a/u["exec"](s))',
    'f(exec(s))',
    'f(/a/u.exec)',
    'function g(re: RegExp) { f(re.exec(s)) }',
    'let re = /a/u; re = /b/u; f(re.exec(s))',
    'var re = /a/u; f(re.exec(s))',
    'const re = other; f(re.exec(s))',
    'const re = /a/u; eval(code); f(re.exec(s))',
    String.raw`f(/(?<a>x)\k<b>/u.exec(s))`,
    "const re = /a/u; re.compile('b'); f(re.exec(s))",
    'const re = /a/u; re.exec = g; f(re.exec(s))',
    'const re = /a/u; re.lastIndex = 0; f(re.exec(s))',
    'const re = /a/u; use(re); f(re.exec(s))',
    'const re = /a/u; let copy = re; f(re.exec(s))',
    'const re = /a/u; s.replace(x, re); f(re.exec(s))',
    'const re = /a/u; re.exec; f(re.exec(s))',
    'const re = /a/u; f(re.exec(s)); export { re }',
    'export const re = /a/u; f(re.exec(s))',
  ])('reads none in %s', source => {
    expect(read(source)).toBeNull()
  })

  it('follows a function local of a component and not its top level', () => {
    expect(
      read('function g() { const re = /a/u; f(re.exec(s)) }', true),
    ).toStrictEqual({ literal: '/a/u', method: 'exec' })
    expect(read('const re = /a/u; f(re.exec(s))', true)).toBeNull()
    expect(read('let re = /a/u; f(re.exec(s))', true)).toBeNull()
  })

  it('walks the reads of a name once for all of its calls', () => {
    let runs = Array.from(
      { length: 100 },
      (_, index) => `f(re.exec(s${index}))`,
    )
    let file = createTestFile(['const re = /a/u', ...runs].join('\n'))
    let program: AnalyzedProgram = {
      scopes: file.scopes,
      shared: new Set(),
      tree: file.tree,
    }
    let calls = runs.map((_, index) =>
      file.find('CallExpression', `re.exec(s${index})`),
    )
    let lookups = vi.spyOn(file.tree.slots, 'get')

    expect(getMatchRegex(program, calls[0]!)).toMatchObject({ method: 'exec' })

    let walk = lookups.mock.calls.length

    expect(walk).toBeGreaterThanOrEqual(runs.length)
    expect(
      calls.map(call => getMatchRegex(program, call)?.method),
    ).toStrictEqual(runs.map(() => 'exec'))
    expect(lookups).toHaveBeenCalledTimes(walk)
  })
})
