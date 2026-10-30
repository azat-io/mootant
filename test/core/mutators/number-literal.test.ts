import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Lists the mutants of number-literal for a snippet.
 *
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Mutants as `original -> replacement`.
 */
function mutate(source: string, setup: MutatorSetup = {}): string[] {
  return runMutator('number-literal', source, setup).map(formatMutant)
}

describe('numberLiteral', () => {
  it.each<{ expected: string[]; source: string }>([
    { expected: ['0 -> 1'], source: 'x = 0' },
    { expected: ['10 -> 11'], source: 'x = 10' },
    { expected: ['0.2 -> 1.2'], source: 'x = 0.2' },
    { expected: ['-1 -> 0'], source: 'x = -1' },
    { expected: ['-2.5 -> -1.5'], source: 'x = -2.5' },
    { expected: ['0xFF -> 0x100'], source: 'x = 0xFF' },
    { expected: ['10n -> 11n'], source: 'x = 10n' },
    { expected: ['1. -> 2', '2 -> 3'], source: 'x = 1..toFixed(2)' },
    { expected: ['0.2 -> 1.2'], source: 'let rate = 0.2' },
    {
      source: 'x = items[items.length - 1]',
      expected: ['1 -> 2'],
    },
    { expected: ['0xff -> 0x100'], source: 'x = 0xff' },
    { source: 'if (-1) run()', expected: ['-1 -> 0'] },
    { source: 'if (count > 10) run()', expected: [] },
    { source: 'if (x === 0) run()', expected: [] },
    { source: 'if (1) run()', expected: [] },
    { source: 'while (0) run()', expected: [] },
    { source: "x = { 1: 'one' }", expected: [] },
    { source: 'switch (x) { case 2: run() }', expected: [] },
    { source: 'setTimeout(run, 100)', expected: [] },
    { source: "console.log('n', 5)", expected: ['5 -> 6'] },
    { source: 'x = 9007199254740993', expected: [] },
    { source: 'x = path.slice(-1)', expected: [] },
    { source: 'function f(n: number) { x = n || -1 }', expected: [] },
  ])('mutates $source as in the catalog', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    { expected: ['1_000 -> 1001'], source: 'x = 1_000' },
    { expected: ['1e3 -> 1001'], source: 'x = 1e3' },
    { expected: ['0x1Fn -> 0x20n'], source: 'x = 0x1Fn' },
    { expected: ['0b11 -> 0b100'], source: 'x = 0b11' },
    { expected: ['0o7 -> 0o10'], source: 'x = 0o7' },
    { expected: ['-0x10 -> -15'], source: 'x = -0x10' },
    { expected: ['-1n -> 0n'], source: 'x = -1n' },
    { expected: ['1 -> 2'], source: 'x = -(1)' },
    { expected: ['1 -> 2'], source: 'x = +1' },
    { expected: ['0 -> 1'], source: 'x = !0' },
    { source: 'x = !1', expected: [] },
    { source: 'if (0) run()', expected: ['0 -> 1'] },
    { expected: ['0 -> 1'], source: 'x = a && 0' },
    { source: 'setTimeout(run, 100, 5)', expected: ['5 -> 6'] },
    { source: 'delay(run, 100)', expected: ['100 -> 101'] },
    { expected: ['0 -> 1', '100 -> 101'], source: 'timers[0](run, 100)' },
    { source: 'x = list.at(1)', expected: ['1 -> 2'] },
    { source: 'x = { [1]: one }', expected: [] },
    { source: 'if (ok && 0) run()', expected: [] },
    { source: 'if (a || 0) run()', expected: [] },
    { source: 'while (2) run()', expected: [] },
    { source: 'for (;;) { if (-1) break }', expected: [] },
    { source: 'window.setInterval(run, 100)', expected: [] },
    { source: 'getWindow().setTimeout(run, 100)', expected: ['100 -> 101'] },
    { source: "window['setTimeout'](run, 100)", expected: [] },
    { source: "timers['setTimeout'](run, 100)", expected: ['100 -> 101'] },
    { source: 'setTimeout(run, quick ? 1 : 4000)', expected: [] },
    { source: 'setTimeout(run, options ? options.delay : 1000)', expected: [] },
    { source: 'setTimeout(run, delays[0].ms)', expected: ['0 -> 1'] },
    { source: 'setInterval(tick, seconds * 1000)', expected: [] },
    { source: 'setTimeout(run, f(100))', expected: ['100 -> 101'] },
    {
      source: 'let setTimeout = f\nsetTimeout(run, 100)',
      expected: ['100 -> 101'],
    },
    {
      source: "import { setTimeout } from 'node:timers'\nsetTimeout(run, 100)",
      expected: [],
    },
    {
      source:
        "import { setTimeout } from 'node:timers/promises'\nsetTimeout(100, 5)",
      expected: ['5 -> 6'],
    },
    {
      source:
        "import * as timers from 'timers/promises'\ntimers.setInterval(100)",
      expected: [],
    },
    { source: 'scheduler.wait(100)', expected: [] },
    { source: 'x = -(0) ? a : b', expected: ['0 -> 1'] },
    { source: 'x = -x', expected: [] },
    { source: "x = -'a'", expected: [] },
    { source: 'if (x === void 0) a()', expected: [] },
    { source: 'let y = void -1', expected: [] },
    { source: 'let z = x ?? void 0', expected: [] },
    { source: 'x = void f(0)', expected: ['0 -> 1'] },
  ])('handles $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      source: 'function f(s: string) { x = s.slice(-1) }',
      expected: [],
    },
    {
      source: 'function f(s: string) { x = s.substr(-1, undefined) }',
      expected: [],
    },
    {
      source: 'function f(list: number[]) { x = list.slice(-1) }',
      expected: [],
    },
    {
      source: 'function f(list: number[]) { x = list.substr(-1) }',
      expected: ['-1 -> 0'],
    },
    {
      source: 'function f(map: Map<string, number>) { x = map.slice(-1) }',
      expected: ['-1 -> 0'],
    },
    {
      source: 'function f(s: string) { x = s.slice(-1, 2) }',
      expected: ['-1 -> 0', '2 -> 3'],
    },
    {
      source: 'function f(s: string) { x = s.slice(-1, end) }',
      expected: ['-1 -> 0'],
    },
    {
      source: 'function f(s: string) { x = s.slice(-1, undefined, 2) }',
      expected: ['-1 -> 0', '2 -> 3'],
    },
    {
      source: 'function f(s: string) { x = s.slice(-2) }',
      expected: ['-2 -> -1'],
    },
    {
      source: 'function f(s: string) { x = s.slice(1, -1) }',
      expected: ['1 -> 2', '-1 -> 0'],
    },
    {
      source: 'x = path[slice](-1)',
      expected: ['-1 -> 0'],
    },
    {
      source: 'x = path.trim(-1)',
      expected: ['-1 -> 0'],
    },
    {
      source: 'class A extends B { f() { return super.slice(-1) } }',
      expected: ['-1 -> 0'],
    },
    {
      source: 'class A { #slice() {} f(o) { return o.#slice(-1) } }',
      expected: ['-1 -> 0'],
    },
    {
      source: [
        'function f(s: string) {',
        '  let undefined = 2',
        '  x = s.slice(-1, undefined)',
        '}',
      ].join('\n'),
      expected: ['2 -> 3', '-1 -> 0'],
    },
    {
      source:
        'function f(items: string[]) { return (items?.slice(-1).join)() }',
      expected: ['-1 -> 0'],
    },
    {
      source: 'function f(s: string) { return (s?.slice(-1).at)(0) }',
      expected: ['-1 -> 0', '0 -> 1'],
    },
  ])('treats slice(-1) in $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      source: 'x = rows.sort((a, b) => a.n > b.n ? 1 : -1)',
      expected: ['-1 -> 0'],
    },
    {
      source: 'x = rows.toSorted((a, b) => { return a.n > b.n ? (1) : -1 })',
      expected: ['-1 -> 0'],
    },
    {
      source: 'x = rows.sort((a, b) => a.n - b.n > 0 ? 2 : 0)',
      expected: ['0 -> 1'],
    },
    {
      source: 'x = rows.map(row => row.ok ? 1 : -1)',
      expected: ['1 -> 2', '-1 -> 0'],
    },
    {
      source: 'function f(ok) { return ok ? 1 : -1 }',
      expected: ['1 -> 2', '-1 -> 0'],
    },
  ])('keeps the sign of a comparator in $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      source: 'x = rows.filter(row => { if (row.ok) return 2; return 0 })',
      expected: ['0 -> 1'],
    },
    {
      source: 'x = rows.sort(row => { if (row.ok) return 0; return 1 })',
      expected: [],
    },
    {
      source: 'x = rows.map(row => { if (row.ok) return 2; return 0 })',
      expected: ['2 -> 3', '0 -> 1'],
    },
    {
      source: 'x = rows.sort((a, b) => { if (a.n > b.n) return -1; return 0 })',
      expected: ['0 -> 1'],
    },
    {
      source: 'x = flag ? 1 : 0',
      expected: ['1 -> 2'],
    },
    {
      source: [
        '// mootant-ignore-next-line condition',
        'x = flag ? 1 : 0',
      ].join('\n'),
      expected: ['1 -> 2'],
    },
    {
      source: 'function f(x: number) { return x >= 5 ? 0 : 1 }',
      expected: ['1 -> 2'],
    },
  ])(
    'leaves a forced decision to its owner in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        'function f(x: number) {',
        '  // mootant-ignore-next-line comparison-operator, condition',
        '  return x >= 5 ? 0 : 1',
        '}',
      ].join('\n'),
      setup: {},
    },
    {
      setup: { mutators: { 'comparison-operator': 'off', condition: 'off' } },
      source: 'function f(x: number) { return x >= 5 ? 0 : 1 }',
    },
  ])(
    'copies a branch when no mutant of the test will run in $source',
    ({ source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual([
        '5 -> 6',
        '0 -> 1',
        '1 -> 2',
      ])
    },
  )

  it.each<{ setup: MutatorSetup; expected: string[]; source: string }>([
    {
      source: [
        'function f(count: number) {',
        '  // mootant-ignore-next-line comparison-operator',
        '  if (count >= 10) run()',
        '}',
      ].join('\n'),
      expected: ['10 -> 11'],
      setup: {},
    },
    {
      source: 'function f(count: number) { if (count >= 10) run() }',
      setup: { mutators: { 'comparison-operator': 'off' } },
      expected: ['10 -> 11'],
    },
    {
      source: [
        'function f(count: number) {',
        '  // mootant-ignore-next-line comparison-operator',
        '  if (count > 10) run()',
        '}',
      ].join('\n'),
      expected: [],
      setup: {},
    },
  ])(
    'changes a compared number when the comparison will not run in $source',
    ({ expected, source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; expected: string[]; source: string }>([
    {
      source: 'function f(n: number | undefined) { x = n || -1 }',
      expected: [],
      setup: {},
    },
    {
      source: [
        'function f(n: number | undefined) {',
        '  // mootant-ignore-next-line logical-operator',
        '  x = n || -1',
        '}',
      ].join('\n'),
      expected: ['-1 -> 0'],
      setup: {},
    },
    {
      source: 'function f(n: number | undefined) { x = n || -1 }',
      setup: { mutators: { 'logical-operator': 'off' } },
      expected: ['-1 -> 0'],
    },
    {
      setup: { mutators: { 'logical-operator': 'off' } },
      source: 'function f(n: number) { x = n || -1 }',
      expected: [],
    },
  ])(
    'empties an || default of $source with $setup',
    ({ expected, source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup }>([
    { setup: { settings: { timeouts: true } } },
    { setup: { preset: 'strict' } },
  ])('emits the timeout-only flips with $setup', ({ setup }) => {
    let source = ['while (0) run()', 'for (;;) {', '  if (-1) break', '}'].join(
      '\n',
    )

    expect(mutate(source, setup)).toStrictEqual(['0 -> 1', '-1 -> 0'])
  })

  it.each<{ setup: MutatorSetup }>([
    { setup: { mutators: { 'number-literal': ['on', { caseTests: true }] } } },
    { setup: { preset: 'strict' } },
  ])('mutates case labels with $setup', ({ setup }) => {
    expect(mutate('switch (x) { case 2: run() }', setup)).toStrictEqual([
      '2 -> 3',
    ])
  })

  it.each<{ setup: MutatorSetup; expected: string[]; source: string }>([
    {
      setup: { mutators: { condition: 'off' } },
      source: 'x = flag ? 1 : 0',
      expected: ['1 -> 2'],
    },
    {
      setup: { mutators: { 'comparison-operator': 'off' } },
      source: 'if (count > 10) run()',
      expected: [],
    },
    {
      source: 'function f(sku: string) { x = sku.slice(-1) }',
      setup: { mutators: { 'method-call': 'off' } },
      expected: [],
    },
  ])(
    'keeps the static owner of $source with $setup',
    ({ expected, source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      setup: { mutators: { 'method-call': 'off' } },
      source: 'x = path.slice(-1)',
    },
    {
      source: 'function f(items: number[]) { x = items.slice(-1) }',
      setup: { mutators: { 'method-call': 'off' } },
    },
    {
      source: [
        'function f(items: number[]) {',
        '  // mootant-ignore-next-line method-call',
        '  x = items.slice(-1)',
        '}',
      ].join('\n'),
      setup: {},
    },
  ])(
    'brings back slice(0) of $source when the removal of the call does not run',
    ({ source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual(['-1 -> 0'])
    },
  )

  it.each<{ expected: string[]; source: string }>([
    { source: 'if (-1) run()', expected: ['-1 -> 0'] },
    { source: 'if (!0) run()', expected: ['0 -> 1'] },
  ])(
    'owns the truth of the literal test in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<[string, string[]]>([
    [
      'declare let n: number; declare let s: string; declare let list: number[]; a = n === 1; b = void 0; switch (n) { case 2: break }; setTimeout(run, 100); c = s.slice(-1); e = list.slice(-1); if (2) run(); d = items.sort((x, y) => (x > y ? 1 : -1)); x = { [1]: 2 }',
      [
        '1 -> 2 (subsumed O4)',
        '0 -> 1 (equivalent void-operand)',
        '2 -> 3 (noise case-label)',
        '100 -> 101 (noise timer-delay)',
        '-1 -> 0 (owned O18)',
        '-1 -> 0 (subsumed slice-copy)',
        '2 -> 3 (equivalent same-truth)',
        '1 -> 2 (equivalent comparator-sign)',
        '1 -> 2 (noise property-key)',
      ],
    ],
    [
      'declare let n: number; x = n || -1; while (0) {}',
      ['-1 -> 0 (owned O16)', '0 -> 1 (timeout loop-running)'],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('number-literal', source)).toStrictEqual(expected)
  })
})
