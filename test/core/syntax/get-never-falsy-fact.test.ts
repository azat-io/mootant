import { describe, expect, it } from 'vitest'

import { getNeverFalsyFact } from '../../../core/syntax/get-never-falsy-fact'
import { solveValueBounds } from '../../../core/syntax/solve-value-bounds'
import { createTestFile } from '../../helpers/create-test-file'
import { findProbe } from '../../helpers/find-probe'

/**
 * Finds why the argument of the last `f(...)` of a snippet is never falsy when
 * it is defined.
 *
 * @param source - Snippet that calls `f`.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The reason, or null.
 */
function explain(source: string, component = false): string | null {
  let file = createTestFile(source)
  let bounds = solveValueBounds(
    file.tree,
    file.scopes,
    new Set(component ? [file.parsed.program] : []),
  )
  return getNeverFalsyFact(bounds, findProbe(file))
}

/**
 * Reason of the whole match of a regex that cannot match an empty string.
 */
const MATCH =
  'it is the whole match of a regex that cannot match an empty string'

/**
 * Counts names into a count map `counts`, whose values are at least 1.
 */
const COUNTS = [
  'let counts = new Map<string, number>()',
  'for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)',
].join('\n')

describe('getNeverFalsyFact', () => {
  it.each([
    {
      expected: '`toISOString` never returns an empty string',
      source: 'f(date.toISOString())',
    },
    {
      expected: '`toISOString` never returns an empty string',
      source: 'f(update.effectiveDate?.toISOString())',
    },
    {
      expected: '`toUTCString` never returns an empty string',
      source: 'f((date as Date).toUTCString())',
    },
    {
      expected: '`toFixed` never returns an empty string',
      source: 'f(n.toFixed?.(2))',
    },
    {
      expected: '`toExponential` never returns an empty string',
      source: 'f(n.toExponential())',
    },
    {
      expected: '`toPrecision` never returns an empty string',
      source: 'f(n.toPrecision(3))',
    },
    { source: 'f(/[a-z]+$/u.exec(hue)?.[0])', expected: MATCH },
    { source: 'f(/a+/u.exec(s)[0])', expected: MATCH },
    { source: 'f(/a+/u.exec(s)![0])', expected: MATCH },
    { source: 'f(s.match(/a+/u)?.[0])', expected: MATCH },
    { source: 'f(s.match(/a|bc/gu)?.[0])', expected: MATCH },
    {
      source: String.raw`const re = /\d+/u; f(re.exec(s)?.[0])`,
      expected: MATCH,
    },
    {
      expected:
        'it is a number of at least 1, since every value stored in `counts` is at least 1',
      source: `${COUNTS}\nf(counts.get(name))`,
    },
    {
      expected:
        'it is a number of at least 1, since every value stored in `counts` is at least 1',
      source: `${COUNTS}\nfor (let [name, count] of counts) f(count)`,
    },
    {
      expected:
        'it is a number of at least 1, since a length is never negative',
      source: 'f(s.length + 1)',
    },
    {
      expected:
        'it is a number of at least 1, since `n` starts at 1 and only grows',
      source: 'let n = 1; n++; f(n)',
    },
  ])('explains $source', ({ expected, source }) => {
    expect(explain(source)).toBe(expected)
  })

  it.each([
    "f('a')",
    `f(\`a\${b}\`)`,
    "f('#' + id)",
    "const name = 'x'; f(name)",
    'f(1)',
    'f(true)',
    'f(date.toString())',
    'f(date.toLocaleDateString())',
    "f(date['toISOString']())",
    'f(toISOString(date))',
    'f(date.toISOString)',
    'class A { #toFixed() { return "" } g() { f(this.#toFixed()) } }',
    'f(/a*/u.exec(text)?.[0])',
    'f(/(?:)/u.exec(text)?.[0])',
    'f(/^/u.exec(text)?.[0])',
    'f(/a+/u.exec(s)?.[1])',
    'f(/a+/u.exec(s)?.[i])',
    'f(/a+/u.exec(s)?.index)',
    'f(/a+/u.exec(s))',
    'f(re.exec(s)?.[0])',
    'f(s.match(re)?.[0])',
    'f(list[0])',
    String.raw`f(/(?<a>x+)\k<b>/u.exec(s)?.[0])`,
    'let m = new Map<string, number>(); m.set(k, -1); f(m.get(k))',
    `export ${COUNTS}\nf(counts.get(name))`,
    'f(s.length)',
    'f(s.indexOf(x) + 1)',
    String.raw`const re = /\d+/u; re.compile('\d*'); f(re.exec(s)?.[0])`,
    String.raw`const re = /\d+/u; re.exec = g; f(re.exec(s)?.[0])`,
    String.raw`const re = /\d+/u; use(re); f(s.match(re)?.[0])`,
  ])('finds none in %s', source => {
    expect(explain(source)).toBeNull()
  })

  it('reads no count map of a component, whose other script blocks may declare Map', () => {
    expect(explain(`${COUNTS}\nf(counts.get(name))`, true)).toBeNull()
    expect(
      explain(`function g() {\n${COUNTS}\nf(counts.get(name))\n}`, true),
    ).toBeNull()
  })

  it('reads a regex of a component only inside a function', () => {
    expect(
      explain(String.raw`const re = /\d+/u; f(re.exec(s)?.[0])`, true),
    ).toBeNull()
    expect(
      explain(
        String.raw`function g() { const re = /\d+/u; f(re.exec(s)?.[0]) }`,
        true,
      ),
    ).toBe(MATCH)
  })
})
