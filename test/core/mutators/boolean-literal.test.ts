import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { runMutator } from '../../helpers/run-mutator'

describe('booleanLiteral', () => {
  it.each<{
    expected: { replacement: string; original: string }[]
    source: string
  }>([
    {
      expected: [{ replacement: 'true', original: 'false' }],
      source: 'let done = false',
    },
    {
      expected: [{ replacement: 'false', original: 'true' }],
      source: 'let options = { verbose: true }',
    },
    {
      expected: [{ replacement: 'true', original: 'false' }],
      source: 'f(!false)',
    },
    {
      expected: [{ replacement: 'false', original: 'true' }],
      source: 'while (true) { if (step()) break }',
    },
    {
      expected: [{ replacement: 'true', original: 'false' }],
      source: 'for (;;) { if (false) break }',
    },
    {
      expected: [{ replacement: 'false', original: 'true' }],
      source: 'y = -true',
    },
    {
      expected: [{ replacement: 'false', original: 'true' }],
      source: 'y = (true as boolean)',
    },
    { source: 'y = x === true', expected: [] },
    { source: 'y = x === !true', expected: [] },
    { source: 'y = void true', expected: [] },
    { source: 'y = void !false', expected: [] },
    { source: 'if (ok && true) f()', expected: [] },
    { source: 'y = ok ? true : false', expected: [] },
    {
      source: [
        'function canEdit(u: User): boolean {',
        '  if (u.isAdmin) return true',
        '  return false',
        '}',
      ].join('\n'),
      expected: [],
    },
    { source: 'do { work() } while (false)', expected: [] },
    { source: 'while (!true) {}', expected: [] },
    { source: 'for (;;) { if (true) break }', expected: [] },
    {
      source: 'rows.sort((r) => { if (r.x) return 0; return true })',
      expected: [],
    },
    { source: 'y = x > 1 ? true : false', expected: [] },
    {
      source: [
        'function f(ok, a: boolean) {',
        '  return ok ? a : false',
        '}',
      ].join('\n'),
      expected: [],
    },
    {
      source: [
        'function f(flag?: boolean) {',
        '  return flag || true',
        '}',
      ].join('\n'),
      expected: [],
    },
    { source: "y = 'true'", expected: [] },
    {
      source: [
        'function f(x: boolean | undefined) {',
        '  if (x ?? false) run()',
        '}',
      ].join('\n'),
      expected: [{ replacement: 'true', original: 'false' }],
    },
    {
      source: [
        'function f(type: unknown): boolean | null {',
        '  if (check(type)) {',
        '    return false',
        '  }',
        '  return null',
        '}',
      ].join('\n'),
      expected: [{ replacement: 'true', original: 'false' }],
    },
    {
      source: 'function f(ok, a) { if (ok) return a; return false }',
      expected: [{ replacement: 'true', original: 'false' }],
    },
    {
      source: 'rows.filter((r) => { if (r.x) return 1; return false })',
      expected: [{ replacement: 'true', original: 'false' }],
    },
    {
      source: 'rows.toSorted((r) => { if (r.x) return 0; return true })',
      expected: [{ replacement: 'false', original: 'true' }],
    },
  ])('mutates $source', ({ expected, source }) => {
    expect(runMutator('boolean-literal', source)).toMatchObject(expected)
  })

  it.each<{ setup: MutatorSetup }>([
    { setup: { settings: { timeouts: true } } },
    { setup: { preset: 'strict' } },
  ])('flips a literal toward its running value with $setup', ({ setup }) => {
    let source = [
      'do { work() } while (false)',
      'while (!true) {}',
      'for (;;) { if (true) break }',
    ].join('\n')

    expect(runMutator('boolean-literal', source, setup)).toMatchObject([
      { replacement: 'true', original: 'false', line: 1 },
      { replacement: 'false', original: 'true', line: 2 },
      { replacement: 'false', original: 'true', line: 3 },
    ])
  })

  it.each<{
    expected: { replacement: string; original: string }[]
    setup: MutatorSetup
    source: string
  }>([
    {
      source: [
        '// mootant-ignore-next-line comparison-operator',
        'y = x > 1 ? true : false',
      ].join('\n'),
      expected: [
        { replacement: 'false', original: 'true' },
        { replacement: 'true', original: 'false' },
      ],
      setup: {},
    },
    {
      expected: [
        { replacement: 'false', original: 'true' },
        { replacement: 'true', original: 'false' },
      ],
      setup: { mutators: { 'comparison-operator': 'off' } },
      source: 'y = x > 1 ? true : false',
    },
    {
      source: ['// mootant-ignore-next-line', 'y = x > 1 ? true : false'].join(
        '\n',
      ),
      expected: [],
      setup: {},
    },
    {
      source: [
        '// mootant-ignore-next-line condition',
        'y = ok ? true : false',
      ].join('\n'),
      expected: [],
      setup: {},
    },
    {
      setup: { mutators: { condition: 'off' } },
      source: 'y = ok ? true : false',
      expected: [],
    },
    {
      source: [
        'function f(ok, a: boolean) {',
        '  // mootant-ignore-next-line condition',
        '  return ok ? a : false',
        '}',
      ].join('\n'),
      expected: [{ replacement: 'true', original: 'false' }],
      setup: {},
    },
    {
      source: [
        'function f(ok, a: boolean) {',
        '  return ok ? a : false',
        '}',
      ].join('\n'),
      expected: [{ replacement: 'true', original: 'false' }],
      setup: { mutators: { condition: 'off' } },
    },
    {
      source: [
        'function f(flag?: boolean) {',
        '  // mootant-ignore-next-line logical-operator',
        '  return flag || true',
        '}',
      ].join('\n'),
      expected: [{ replacement: 'false', original: 'true' }],
      setup: {},
    },
    {
      source: [
        'function f(flag?: boolean) {',
        '  return flag || true',
        '}',
      ].join('\n'),
      expected: [{ replacement: 'false', original: 'true' }],
      setup: { mutators: { 'logical-operator': 'off' } },
    },
  ])(
    'judges the justifying mutant of $source with $setup',
    ({ expected, source, setup }) => {
      expect(runMutator('boolean-literal', source, setup)).toMatchObject(
        expected,
      )
    },
  )

  it.each<{
    expected: { replacement: string; original: string }[]
    mutator: string
    source: string
  }>([
    {
      source: [
        'function canEdit(u: User): boolean {',
        '  if (u.isAdmin) return true',
        '  return false',
        '}',
      ].join('\n'),
      expected: [
        { original: 'u.isAdmin', replacement: 'true' },
        { original: 'u.isAdmin', replacement: 'false' },
      ],
      mutator: 'condition',
    },
    {
      expected: [
        { replacement: 'true', original: 'ok' },
        { replacement: 'false', original: 'ok' },
      ],
      source: 'y = ok ? true : false',
      mutator: 'condition',
    },
    {
      expected: [
        { replacement: 'x >= 1', original: 'x > 1' },
        { replacement: 'x != 1', original: 'x > 1' },
        { replacement: 'x > 2', original: 'x > 1' },
      ],
      source: 'y = x > 1 ? true : false',
      mutator: 'comparison-operator',
    },
    {
      expected: [
        { original: 'flag || true', replacement: 'true' },
        { replacement: 'flag ?? true', original: 'flag || true' },
      ],
      source: [
        'function f(flag?: boolean) {',
        '  return flag || true',
        '}',
      ].join('\n'),
      mutator: 'logical-operator',
    },
  ])('leaves $source to $mutator', ({ expected, mutator, source }) => {
    expect(runMutator(mutator, source)).toMatchObject(expected)
    expect(runMutator('boolean-literal', source)).toEqual([])
  })
})
