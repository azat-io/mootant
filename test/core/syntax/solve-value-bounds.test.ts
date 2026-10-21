import type { Node } from 'oxc-parser'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ValueBounds } from '../../../types/syntax/value-bounds'
import type { ValueBound } from '../../../types/syntax/value-bound'
import type { Binding } from '../../../types/syntax/binding'

import { solveValueBounds } from '../../../core/syntax/solve-value-bounds'
import { getValueBound } from '../../../core/syntax/get-value-bound'
import { createTestFile } from '../../helpers/create-test-file'

vi.mock(
  import('../../../core/syntax/get-value-bound'),
  async importOriginal => {
    let actual = await importOriginal()
    return { getValueBound: vi.fn(actual.getValueBound) }
  },
)

/**
 * Bounds of a snippet with a lookup of its names.
 */
interface SolvedSnippet {
  /**
   * Finds the binding that declares a name; the first one when several do.
   *
   * @param name - Declared name.
   * @returns The binding.
   */
  named(name: string): Binding

  /**
   * Reads the source text of a node of the snippet.
   *
   * @param node - Node of the snippet.
   * @returns Its text.
   */
  text(node: Node): string

  /**
   * Bounds of the snippet.
   */
  bounds: ValueBounds
}

/**
 * Builds the source of a function with counters that each write from the
 * others, the dense stress file of the critique: `p0` to `p{count - 1}`, each
 * written `width` times from the next ones and raised when it is 0.
 *
 * @param count - Number of counters.
 * @param width - Number of writes of each counter from the others.
 * @returns Source lines of the function.
 */
function buildDense(count: number, width: number): string[] {
  let lines = ['export function scan(text: string): number {']
  for (let index = 0; index < count; index++) {
    lines.push(`  let p${index} = text.length`)
  }
  lines.push('  for (let i = 0; i < text.length; i++) {')
  for (let index = 0; index < count; index++) {
    let writes = Array.from(
      { length: width },
      (_, step) => `p${index} = p${(index + step + 1) % count} + ${step + 1}`,
    )
    lines.push(
      `    if (text[i] === '${String.fromCodePoint(97 + index)}') { ${writes.join('; ')} }`,
      `    if (p${index} === 0) p${index}++`,
    )
  }
  lines.push('  }', '  return p0', '}')
  return lines
}

/**
 * Solves the bounds of a snippet.
 *
 * @param lines - Source lines of the snippet.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The bounds and a lookup of the declared names.
 */
function solve(lines: string[], component = false): SolvedSnippet {
  let file = createTestFile(lines.join('\n'))
  let bindings = [...new Set(file.scopes.bindings.values())]
  return {
    named: name =>
      bindings.find(
        binding =>
          binding.identifier.type === 'Identifier' &&
          binding.identifier.name === name,
      )!,
    bounds: solveValueBounds(
      file.tree,
      file.scopes,
      new Set(component ? [file.parsed.program] : []),
    ),
    text: node => file.sourceCode.getText(node),
  }
}

/**
 * Builds the source of counters that each lower the next one by one write per
 * round of the fixed point: `c0` starts at 0, and every other `c{index}` starts
 * at 1000 and is written `c{index - 1} + 1`.
 *
 * @param count - Number of counters.
 * @returns Source lines of the counters.
 */
function buildChain(count: number): string[] {
  let lines = ['let c0 = 0', 'c0 += s.length']
  for (let index = 1; index < count; index++) {
    lines.push(`let c${index} = 1000`, `c${index} = c${index - 1} + 1`)
  }
  return lines
}

/**
 * Finds the bound of a counter of a snippet.
 *
 * @param lines - Source lines of the snippet.
 * @param name - Name that the counter declares.
 * @returns The bound, or null when the counter has none.
 */
function counterOf(lines: string[], name: string): ValueBound | null {
  let { bounds, named } = solve(lines)
  return bounds.counters.get(named(name))!
}

describe('solveValueBounds', () => {
  beforeEach(() => {
    vi.mocked(getValueBound).mockClear()
  })

  it.each([
    {
      reason: '`row` starts at 0 and only grows',
      lines: ['let row = 0', 'row++'],
      lower: 0,
    },
    {
      lines: ['let n = s.length', 'n += 1', 'n += t.length'],
      reason: '`n` starts at 0 or more and only grows',
      lower: 0,
    },
    {
      reason: '`n` starts at -1 and every write keeps it at least -1',
      lines: ['let n = -1', 'n = s.indexOf(x)'],
      lower: -1,
    },
    {
      lines: [
        'let n = 0',
        "for (let c of s) if (c === '(') n++; else if (c === ')' && n > 0) n--",
      ],
      reason: '`n` starts at 0 and goes down only right after `n > 0`',
      lower: 0,
    },
    {
      lines: [
        'let n = 0',
        'if (a) n += 2',
        'if (n > 0) n -= 1',
        'while (n !== 0) { n--; use(n) }',
      ],
      reason:
        '`n` starts at 0 and goes down only right after `n > 0` or right after `n !== 0`',
      lower: 0,
    },
    {
      lines: [
        'let position = 0',
        'while (position < code.length) {',
        '  let trivia = read(code, position)',
        '  if (trivia) {',
        '    let end = position + trivia.length',
        '    position = end',
        '    continue',
        '  }',
        '  position += 1',
        '}',
      ],
      reason: '`position` starts at 0 and every write keeps it at least 0',
      lower: 0,
    },
    {
      reason: '`n` starts at 5 and goes down only right after `n > 0`',
      lines: ['let n = 5', 'if (n > 0) n--'],
      lower: 0,
    },
    {
      reason: '`n` starts at 0 and goes down only right after `0x0 < n`',
      lines: ['let n = 0', 'if (a) n += 2', 'while (0x0 < n) n--'],
      lower: 0,
    },
    {
      lines: [
        'let n = 0',
        'if (a) n += 9',
        'if (n > 0) n--',
        'if (n > 1) n--',
        'if (n > 2) n--',
      ],
      reason:
        '`n` starts at 0 and goes down only right after `n > 0` or right after `n > 1` or right after `n > 2`',
      lower: 0,
    },
    {
      lines: [
        'let n = 0',
        'if (a) n += 9',
        ...Array.from({ length: 40 }, (_, step) => `if (n > ${step}) n--`),
      ],
      reason:
        '`n` starts at 0 and goes down only right after `n > 0` or right after `n > 1` or right after one of 38 more guards',
      lower: 0,
    },
  ])('bounds the counter of $lines', ({ reason, lines, lower }) => {
    expect(counterOf(lines, lines[0]!.split(' ', 2)[1]!)).toMatchObject({
      nullable: false,
      because: reason,
      integer: true,
      lower,
    })
  })

  it.each([
    { lines: ['let row = 0', 'row++'], name: 'row', guards: [] },
    {
      lines: [
        'let n = 0',
        "for (let c of s) if (c === '(') n++; else if (c === ')' && n > 0) n--",
      ],
      guards: ['n > 0'],
      name: 'n',
    },
    {
      lines: [
        'let n = 0',
        'if (a) n += 2',
        'if (0 < n) n -= 1',
        'while ((n as number) !== 0) { n--; use(n) }',
        'n = s.length',
      ],
      guards: ['0 < n', '(n as number) !== 0'],
      name: 'n',
    },
  ])(
    'names the guards that the bound of $lines rests on',
    ({ guards, lines, name }) => {
      let { bounds, named, text } = solve(lines)
      let bound = bounds.counters.get(named(name))

      expect(bound).not.toBeNull()
      expect([...(bound!.guards ?? [])].map(text)).toStrictEqual(guards)
      expect(Object.hasOwn(bound!, 'guards')).toBe(guards.length > 0)
    },
  )

  it('bounds the values of a count map and names its value names', () => {
    let { bounds, named } = solve([
      'const counts = new Map<string, number>()',
      'for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)',
      'for (const [name, count] of counts) use(name, count)',
    ])

    expect(bounds.maps.get(named('counts'))).toStrictEqual({
      because: 'every value stored in `counts` is at least 1',
      nullable: false,
      integer: true,
      lower: 1,
    })
    expect(bounds.entries.get(named('count'))).toBe(named('counts'))
  })

  it('bounds a counter and a count map that write each other', () => {
    let { bounds, named } = solve([
      'const m = new Map<string, number>()',
      'let total = 0',
      'm.set(k, total + 2)',
      'total += m.get(k) ?? 0',
    ])

    expect(bounds.maps.get(named('m'))).toMatchObject({ lower: 2 })
    expect(bounds.counters.get(named('total'))).toMatchObject({
      because: '`total` starts at 0 and only grows',
      lower: 0,
    })
  })

  it('tracks whether a counter is an integer', () => {
    expect(counterOf(['let x = 0.5', 'x++'], 'x')).toMatchObject({
      integer: false,
      lower: 0.5,
    })
    expect(counterOf(['let x = 0', 'x = s.length'], 'x')).toMatchObject({
      integer: true,
    })
    expect(counterOf(['let x = 0', 'x = s.length / 2'], 'x')).toBeNull()
  })

  it.each([
    ['let x = 0', 'x *= 2'],
    ['let x = 0', 'x += y'],
    ['let x = 0', 'x += m.get(k) ?? undefined'],
    ['let x = 0', 'x = -s.length'],
    ['let x = 0', 'x = m.get(k)'],
    ['let x = 0', 'x--'],
    ['let x = 0', 'x -= y'],
    ['let x = 0', 'if (x > 0) x -= -1'],
    ['let x = 0', 'for (x of list) use(x)'],
    ['let x = 0', ';[x] = list'],
    ['let x = 0', 'x ||= 1'],
    ['let x = s.indexOf(c)', 'x += s.indexOf(c)'],
    ['let x = maybe?.length', 'x++'],
  ])('gives no bound to the counter of %s; %s', (...lines) => {
    expect(counterOf(lines, 'x')).toBeNull()
  })

  it('gives up on a bound that goes down a fifth time', () => {
    expect(counterOf(['let x = 0', 'x += s.indexOf(c)'], 'x')).toBeNull()
    expect(getValueBound).toHaveBeenCalledTimes(1 + 2 * 5)
  })

  it('gives no bound to names whose start values form a cycle', () => {
    let { bounds, named } = solve([
      'let a = b',
      'let b = a',
      'a++',
      'b++',
      'let x = 0',
      'x += a',
      'const m = new Map<string, number>()',
      'm.set(k, a)',
    ])

    expect(bounds.counters.get(named('a'))).toBeNull()
    expect(bounds.counters.get(named('b'))).toBeNull()
    expect(bounds.maps.get(named('m'))).toBeNull()
    expect(bounds.counters.get(named('x'))).toMatchObject({
      because: '`x` starts at 0 and only grows',
      lower: 0,
    })
  })

  it.each([
    ['const m = new Map<string, number>()', 'm.set(k, m.get(k))'],
    ['const m = new Map<string, number>()', 'm.set(k, s.length - 1)'],
  ])('gives no bound to the count map of %s; %s', (...lines) => {
    let { bounds, named } = solve(lines)

    expect(bounds.maps.get(named('m'))).toBeNull()
  })

  it('takes only the not open let names with a start value and writes as counters', () => {
    let { bounds, named } = solve([
      'let a = 0',
      'a++',
      'let b = 0',
      'var c = 0',
      'c++',
      'let d',
      'd = 1',
      'let [e] = [0]',
      'e++',
      'function g(p = 0) { p++; let local = 0; local++ }',
    ])

    expect([...bounds.counters.keys()]).toStrictEqual([
      named('a'),
      named('local'),
    ])
    expect(bounds.maps.size).toBe(0)
  })

  it('takes no top-level counter of a component', () => {
    let { bounds, named } = solve(
      ['let page = 0', 'page++', 'function g() { let row = 0; row++ }'],
      true,
    )

    expect([...bounds.counters.keys()]).toStrictEqual([named('row')])
  })

  it('solves the dense stress file of twelve counters in one round', () => {
    let { bounds, named } = solve(buildDense(12, 5))

    expect(bounds.counters.get(named('p0'))).toStrictEqual({
      because: '`p0` starts at 0 or more and every write keeps it at least 0',
      nullable: false,
      integer: true,
      lower: 0,
    })
    expect(bounds.counters.get(named('i'))).toMatchObject({ lower: 0 })
    /*
     * The start values of the 13 counters, then one round that bounds each
     * start value and each of the 5 assignments of the 12 counters, and the
     * start value of `i`. The reasons come from that round, with no call of
     * their own.
     */
    expect(getValueBound).toHaveBeenCalledTimes(13 + 12 * 6 + 1)
  })

  it.each([
    {
      warmup: ['let warm = 0', 'warm = a40'],
      counter: ['let n = 0', 'n += a60'],
      title: 'a plain write',
    },
    {
      warmup: ['let u = 0', 'u = a40', 'let w = a40', 'w = text.foo'],
      counter: ['let n = a60', 'n++'],
      title: 'a start value',
    },
    {
      warmup: ['let u = 0', 'u = 5', 'u += a40'],
      title: 'a write after one that may lower',
      counter: ['let n = 0', 'n += a60'],
    },
  ])(
    'bounds a counter that reads a long chain after $title read its middle as a fresh solve does',
    ({ counter, warmup }) => {
      let chain = [
        'const a0 = text.length',
        ...Array.from(
          { length: 60 },
          (_, index) => `const a${index + 1} = a${index} + 1`,
        ),
      ]
      let warm = solve([...chain, ...warmup, ...counter])
      let cold = solve([...chain, ...counter])

      expect(cold.bounds.counters.get(cold.named('n'))).toBeNull()
      expect(warm.bounds.counters.get(warm.named('n'))).toBeNull()
    },
  )

  it('solves a chain of counters within 16 rounds and gives a longer one no bound', () => {
    let map = ['const m = new Map<string, number>()', 'm.set(k, 1)']
    let near = solve([...buildChain(16), ...map])
    let far = solve([...buildChain(17), ...map])

    expect(near.bounds.counters.get(near.named('c15'))).toMatchObject({
      lower: 15,
    })
    expect(near.bounds.maps.get(near.named('m'))).toMatchObject({ lower: 1 })
    expect([...far.bounds.counters.values()]).toStrictEqual(
      Array.from({ length: 17 }, () => null),
    )
    expect(far.bounds.maps.get(far.named('m'))).toBeNull()
  })
})
