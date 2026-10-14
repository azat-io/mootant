import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { getLogicalDrops } from '../../../../core/mutators/shared/get-logical-drops'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Lists the drops of a group as labels.
 *
 * @param source - Snippet.
 * @param group - Text of the group.
 * @param setup - File name, disabled mutators and the `nullishSwap` mode.
 * @returns `left`, `right` and `swap` for the emitted mutants.
 */
function dropsOf(
  source: string,
  group: string,
  setup: { mode?: 'distinguishing' | 'always' } & TestContextSetup = {},
): string[] {
  let { context, find } = createTestContext(source, setup)
  let drops = getLogicalDrops(
    find('LogicalExpression', group),
    createRunContext(context),
    setup.mode ?? 'distinguishing',
  )
  return [
    ...(drops.dropLeft ? ['left'] : []),
    ...(drops.swap ? ['swap'] : []),
    ...(drops.dropRight ? ['right'] : []),
  ]
}

describe('getLogicalDrops', () => {
  it.each<[string, string, string[]]>([
    [
      'if (isMember && isActive) run()',
      'isMember && isActive',
      ['left', 'right'],
    ],
    ['if (a && b && c) {}', 'a && b && c', ['right']],
    ['if (a && b && c) {}', 'a && b', ['left', 'right']],
    ['if (a && (b && c)) {}', 'a && (b && c)', ['left']],
    ['if (a && b || c) {}', 'a && b || c', ['left', 'right']],
    [
      'if ((c || a) && (b || (!d && e))) {}',
      '(c || a) && (b || (!d && e))',
      ['left'],
    ],
    [
      'if ((c || a) && (b || (!d && e))) {}',
      'b || (!d && e)',
      ['left', 'right'],
    ],
    [
      'let a: number; if (a > 0 && isActive) {}',
      'a > 0 && isActive',
      ['right'],
    ],
    ['let n: number; if (n !== 0 || flag) {}', 'n !== 0 || flag', ['right']],
    ['let i = 0; while (i < n && !done) step()', 'i < n && !done', ['right']],
    ['while (a || b) step()', 'a || b', ['left', 'right']],
    ['rows.filter(x => x.a && x.b)', 'x.a && x.b', ['left', 'right']],
    [
      "function f(x: string) { if (typeof x === 'string' && x.length) {} }",
      "typeof x === 'string' && x.length",
      ['right'],
    ],
    [
      'interface User {} function f(u: User) { if (!(u === null) || flag) {} }',
      '!(u === null) || flag',
      ['left'],
    ],
    ['if (ok && true) {}', 'ok && true', ['left']],
    [
      'function f(x: boolean | undefined) { if (a && (x ?? false)) {} }',
      'a && (x ?? false)',
      ['left'],
    ],
    ['if (a < b && c > d) {}', 'a < b && c > d', []],
    ['x = a < b && c > d', 'a < b && c > d', []],
    ['x = !a || !!b', '!a || !!b', ['left', 'right']],
  ])('drops in boolean mode: %s', (source, group, expected) => {
    expect(dropsOf(source, group)).toEqual(expected)
  })

  it.each<[string, string, string[]]>([
    [
      'function f(user: User | undefined) { x = user && user.name }',
      'user && user.name',
      ['left', 'right'],
    ],
    [
      "function f(name: string | undefined) { x = name || 'anon' }",
      "name || 'anon'",
      ['left', 'swap'],
    ],
    [
      "function f(title: string) { x = title || 'untitled' }",
      "title || 'untitled'",
      ['left', 'right'],
    ],
    [
      "function f(s: string | undefined) { x = s || '' }",
      "s || ''",
      ['left', 'right'],
    ],
    ["function f(s: string) { x = s || '' }", "s || ''", ['left']],
    ["function f(s: string) { x = s && '' }", "s && ''", ['right']],
    [
      'function f(v: boolean | undefined) { x = v || false }',
      'v || false',
      ['left', 'right'],
    ],
    [
      'function f(o: Record<string, string>) { x = o || {} }',
      'o || {}',
      ['left'],
    ],
    [
      'function f(o: Record<string, string> | undefined) { x = o || {} }',
      'o || {}',
      ['left', 'right'],
    ],
    ['function f(o: object) { x = o && o.a }', 'o && o.a', ['right']],
    ['x = null && a', 'null && a', ['left']],
    ['x = null || a', 'null || a', ['right']],
    ['let f = () => cfg || {}', 'cfg || {}', ['left', 'right']],
    ['x = (a || b) || c', '(a || b) || c', ['right']],
    ['x = a || (b || c)', 'a || (b || c)', ['left']],
    [
      "function f(a: string | undefined, b: string) { x = (a && b) || 'x' }",
      "(a && b) || 'x'",
      ['left', 'right'],
    ],
  ])('drops in value mode: %s', (source, group, expected) => {
    expect(dropsOf(source, group)).toEqual(expected)
  })

  it.each<{ expected: string[]; source: string; group: string; file: string }>([
    {
      source:
        'function f(items) { return <>{items.length > 0 && <Item />}</> }',
      group: 'items.length > 0 && <Item />',
      file: 'example.jsx',
      expected: [],
    },
    {
      source:
        "function f(status) { return <>{status === 'busy' && <Spinner />}</> }",
      group: "status === 'busy' && <Spinner />",
      file: 'example.jsx',
      expected: ['left'],
    },
    {
      source: 'function f(u) { return u.isOwner && u.isActive }',
      group: 'u.isOwner && u.isActive',
      expected: ['left', 'right'],
      file: 'example.js',
    },
    {
      source: 'function f(x) { return x === 0 && isValid(x) }',
      group: 'x === 0 && isValid(x)',
      expected: ['right'],
      file: 'example.js',
    },
    {
      source: 'function f(user) { return user && user.age > 18 }',
      group: 'user && user.age > 18',
      expected: ['left'],
      file: 'example.js',
    },
    {
      source: 'function f(a, b) { return (a > 1) && b }',
      group: '(a > 1) && b',
      expected: ['right'],
      file: 'example.js',
    },
    {
      source: 'function f(a, b) { return (a && b) || c }',
      expected: ['left', 'right'],
      group: '(a && b) || c',
      file: 'example.js',
    },
  ])(
    'applies the polarity rule to $source',
    ({ expected, source, group, file }) => {
      expect(dropsOf(source, group, { file })).toEqual(expected)
    },
  )

  it.each<{
    setup: TestContextSetup
    expected: string[]
    source: string
    group: string
  }>([
    {
      source: [
        '// mootant-ignore-next-line comparison-operator',
        'if (a > 0 && isActive) {}',
      ].join('\n'),
      expected: ['left', 'right'],
      group: 'a > 0 && isActive',
      setup: {},
    },
    {
      source: 'let a: number; if (a > 0 && isActive) {}',
      setup: { disabled: ['comparison-operator'] },
      expected: ['left', 'right'],
      group: 'a > 0 && isActive',
    },
    {
      source: ['// mootant-ignore-next-line', 'if (a > 0 && isActive) {}'].join(
        '\n',
      ),
      group: 'a > 0 && isActive',
      expected: ['right'],
      setup: {},
    },
  ])(
    'brings drops back without the justifying mutant: $source',
    ({ expected, source, group, setup }) => {
      expect(dropsOf(source, group, setup)).toEqual(expected)
    },
  )

  it.each<[string, string, string[]]>([
    ['x = value || 0', 'value || 0', ['left', 'swap']],
    [
      'function f(n: number | undefined) { x = n || 0 }',
      'n || 0',
      ['left', 'swap'],
    ],
    ['x = value || {}', 'value || {}', ['left', 'right']],
  ])('swaps in always mode: %s', (source, group, expected) => {
    expect(dropsOf(source, group, { mode: 'always' })).toEqual(expected)
  })
})
