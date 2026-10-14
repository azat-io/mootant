import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('logicalOperator', () => {
  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        'isMember && isActive -> isActive',
        'isMember && isActive -> isMember',
        'isMember && isActive -> false',
      ],
      source: 'if (isMember && isActive) run()',
    },
    {
      expected: [
        'a && b && c -> a && b',
        'a && b && c -> false',
        'a && b -> b',
        'a && b -> a',
      ],
      source: 'if (a && b && c) run()',
    },
    {
      expected: [
        'a && b || c -> c',
        'a && b || c -> a && b',
        'a && b -> b',
        'a && b -> a',
      ],
      source: 'if (a && b || c) run()',
    },
    {
      expected: [
        '(c || a) && (b || (!d && e)) -> (b || (!d && e))',
        'c || a -> a',
        'c || a -> c',
        'b || (!d && e) -> (!d && e)',
        'b || (!d && e) -> b',
        '!d && e -> e',
        '!d && e -> !d',
      ],
      source: 'if ((c || a) && (b || (!d && e))) run()',
    },
    {
      expected: ['a > 0 && isActive -> a > 0'],
      source: 'if (a > 0 && isActive) run()',
    },
    {
      expected: ['n !== 0 || flag -> n !== 0', 'n !== 0 || flag -> true'],
      source: 'if (n !== 0 || flag) run()',
    },
    {
      expected: ['i < n && !done -> i < n', 'i < n && !done -> false'],
      source: 'while (i < n && !done) step()',
    },
    {
      expected: ['a || b -> b', 'a || b -> a'],
      source: 'while (a || b) step()',
    },
    {
      source: [
        'function both(a: { read: boolean; write: boolean }): boolean {',
        '  return a.read && a.write',
        '}',
      ].join('\n'),
      expected: [
        'a.read && a.write -> a.write',
        'a.read && a.write -> a.read',
        'a.read && a.write -> false',
      ],
    },
    {
      expected: [
        'x.a && x.b -> x.b',
        'x.a && x.b -> x.a',
        'x.a && x.b -> false',
      ],
      source: 'rows.filter((x) => x.a && x.b)',
    },
    {
      expected: [
        'r.a || r.b -> r.b',
        'r.a || r.b -> r.a',
        'r.a || r.b -> true',
      ],
      source: 'rows.filter((r) => r.a || r.b)',
    },
    {
      expected: [
        "typeof x === 'string' && x.length -> typeof x === 'string'",
        "typeof x === 'string' && x.length -> false",
      ],
      source: [
        'function f(x: string) {',
        "  if (typeof x === 'string' && x.length) run()",
        '}',
      ].join('\n'),
    },
    {
      source: [
        'interface User {}',
        'function f(u: User) {',
        '  if (!(u === null) || flag) run()',
        '}',
      ].join('\n'),
      expected: ['!(u === null) || flag -> flag'],
    },
    {
      expected: ['ok && true -> true', 'ok && true -> false'],
      source: 'if (ok && true) run()',
    },
    {
      expected: ["x || '' -> ''", "x || '' -> true"],
      source: "if (x || '') run()",
    },
    {
      expected: ["n && 'yes' -> 'yes'", "n && 'yes' -> false"],
      source: "if (n && 'yes') run()",
    },
  ])(
    'drops the operands of $source in boolean mode',
    ({ expected, source }) => {
      expect(
        runMutator('logical-operator', source).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      source: [
        'function f(x: boolean | undefined) {',
        '  if (x ?? false) run()',
        '}',
      ].join('\n'),
      expected: [],
    },
    {
      source: [
        'function f(x: boolean | undefined) {',
        '  if (a && (x ?? false)) run()',
        '}',
      ].join('\n'),
      expected: [
        'a && (x ?? false) -> (x ?? false)',
        'a && (x ?? false) -> false',
      ],
    },
    {
      source: [
        'function f(x: boolean | undefined) {',
        '  if (a && (x ?? true)) run()',
        '}',
      ].join('\n'),
      expected: ['a && (x ?? true) -> (x ?? true)', 'a && (x ?? true) -> a'],
    },
    {
      source: [
        'function f(n: number | undefined) {',
        '  if (n ?? 1) run()',
        '}',
      ].join('\n'),
      expected: ['n ?? 1 -> n'],
    },
    {
      source: [
        'function f(n: number | undefined) {',
        '  if (n ?? fallback) run()',
        '}',
      ].join('\n'),
      expected: ['n ?? fallback -> n', 'n ?? fallback -> n || fallback'],
    },
    {
      source: [
        'declare let rows: { visible?: boolean }[]',
        'x = rows.filter((r) => r.visible ?? false)',
      ].join('\n'),
      expected: [],
    },
  ])('treats $source as a truth position', ({ expected, source }) => {
    expect(
      runMutator('logical-operator', source).map(formatMutant),
    ).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string; file: string }>([
    {
      source: [
        'function f(user: User | undefined) {',
        '  x = user && user.name',
        '}',
      ].join('\n'),
      expected: ['user && user.name -> user.name', 'user && user.name -> user'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(name: string | undefined) {',
        "  x = name || 'anon'",
        '}',
      ].join('\n'),
      expected: [
        "name || 'anon' -> 'anon'",
        "name || 'anon' -> name ?? 'anon'",
      ],
      file: 'example.ts',
    },
    {
      source: [
        'function f(title: string) {',
        "  x = title || 'untitled'",
        '}',
      ].join('\n'),
      expected: [
        "title || 'untitled' -> 'untitled'",
        "title || 'untitled' -> title",
      ],
      file: 'example.ts',
    },
    {
      source: [
        'function f(s: string | undefined) {',
        "  x = s || ''",
        '}',
      ].join('\n'),
      expected: ["s || '' -> ''", "s || '' -> s"],
      file: 'example.ts',
    },
    {
      source: ['function f(title: string) {', "  x = title || ''", '}'].join(
        '\n',
      ),
      expected: ["title || '' -> ''"],
      file: 'example.ts',
    },
    {
      source: [
        'function f(v: boolean | undefined) {',
        '  x = v || false',
        '}',
      ].join('\n'),
      expected: ['v || false -> false', 'v || false -> v'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(o: Record<string, string>) {',
        '  x = o || {}',
        '}',
      ].join('\n'),
      expected: ['o || {} -> {}'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(o2: Record<string, string> | undefined) {',
        '  x = o2 || {}',
        '}',
      ].join('\n'),
      expected: ['o2 || {} -> {}', 'o2 || {} -> o2'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(o: Record<string, string>) {',
        '  x = o && o.name',
        '}',
      ].join('\n'),
      expected: ['o && o.name -> o'],
      file: 'example.ts',
    },
    {
      source: ['function f(o: null) {', '  x = o && o.name', '}'].join('\n'),
      expected: ['o && o.name -> o.name'],
      file: 'example.ts',
    },
    {
      source: ['function f(o: null) {', '  x = o || other', '}'].join('\n'),
      expected: ['o || other -> o'],
      file: 'example.ts',
    },
    {
      source: ['function f(count: number) {', '  x = count && 0', '}'].join(
        '\n',
      ),
      expected: ['count && 0 -> count'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(count: number | null) {',
        '  x = count ?? 0',
        '}',
      ].join('\n'),
      expected: ['count ?? 0 -> 0', 'count ?? 0 -> count'],
      file: 'example.ts',
    },
    {
      source: ['function f(value: any) {', '  x = value ?? 0', '}'].join('\n'),
      expected: ['value ?? 0 -> value', 'value ?? 0 -> value || 0'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(x: string | undefined) {',
        '  y = x ?? null',
        '}',
      ].join('\n'),
      expected: ['x ?? null -> x || null'],
      file: 'example.ts',
    },
    {
      source: ['function f(x: string) {', "  y = x ?? 'none'", '}'].join('\n'),
      expected: ["x ?? 'none' -> x || 'none'"],
      file: 'example.ts',
    },
    {
      source: ['function f(x: null) {', '  y = x ?? fallback', '}'].join('\n'),
      expected: ['x ?? fallback -> x'],
      file: 'example.ts',
    },
    {
      expected: [
        'a ?? b ?? c ?? 0 -> a ?? b ?? c',
        'a ?? b ?? c ?? 0 -> (a ?? b ?? c) || 0',
        'a ?? b ?? c -> a ?? b',
        'a ?? b -> b',
        'a ?? b -> a',
      ],
      source: 'x = a ?? b ?? c ?? 0',
      file: 'example.js',
    },
    {
      expected: ['cfg || {} -> {}', 'cfg || {} -> cfg'],
      source: 'const f = () => cfg || {}',
      file: 'example.js',
    },
    {
      expected: [
        'a && b || c -> c',
        'a && b || c -> a && b',
        'a && b -> b',
        'a && b -> a',
      ],
      source: 'x = a && b || c',
      file: 'example.js',
    },
    {
      expected: ['a || b || c -> a || b', 'a || b -> b', 'a || b -> a'],
      source: 'x = a || b || c',
      file: 'example.js',
    },
    {
      expected: [
        '(a instanceof B) && c -> c',
        '(a instanceof B) && c -> (a instanceof B)',
      ],
      source: 'x = (a instanceof B) && c',
      file: 'example.ts',
    },
  ])('mutates $source in value mode', ({ expected, source, file }) => {
    expect(
      runMutator('logical-operator', source, { file }).map(formatMutant),
    ).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string; file: string }>([
    {
      source: [
        'function List({ items }: { items: string[] }) {',
        '  return <ul>{items.length > 0 && <Item />}</ul>',
        '}',
      ].join('\n'),
      file: 'example.tsx',
      expected: [],
    },
    {
      source: [
        'function Busy({ status }: { status: string }) {',
        "  return <div>{status === 'busy' && <Spinner />}</div>",
        '}',
      ].join('\n'),
      expected: ["status === 'busy' && <Spinner /> -> <Spinner />"],
      file: 'example.tsx',
    },
    {
      expected: [
        'u.isOwner && u.isActive -> u.isActive',
        'u.isOwner && u.isActive -> u.isOwner',
        'u.isOwner && u.isActive -> false',
      ],
      source: ['function f(u) {', '  return u.isOwner && u.isActive', '}'].join(
        '\n',
      ),
      file: 'example.js',
    },
    {
      expected: [
        'x === 0 && isValid(x) -> x === 0',
        'x === 0 && isValid(x) -> false',
      ],
      source: ['function f(x) {', '  return x === 0 && isValid(x)', '}'].join(
        '\n',
      ),
      file: 'example.js',
    },
    {
      source: [
        'function f(user) {',
        '  return user && user.age > 18',
        '}',
      ].join('\n'),
      expected: ['user && user.age > 18 -> user.age > 18'],
      file: 'example.js',
    },
    {
      source: [
        'function f(x, y, z) {',
        '  return x === 0 && y > 3 && isOk(z)',
        '}',
      ].join('\n'),
      expected: ['x === 0 && y > 3 && isOk(z) -> x === 0 && y > 3'],
      file: 'example.js',
    },
    {
      source: ['function f(u) {', "  return u.name && 'yes'", '}'].join('\n'),
      expected: ["u.name && 'yes' -> 'yes'", "u.name && 'yes' -> u.name"],
      file: 'example.js',
    },
  ])('mutates the returned group $source', ({ expected, source, file }) => {
    expect(
      runMutator('logical-operator', source, { file }).map(formatMutant),
    ).toStrictEqual(expected)
  })

  it.each<{ setup: MutatorSetup; expected: string[] }>([
    { expected: ['a || b -> b', 'a || b -> a'], setup: {} },
    {
      expected: ['a || b -> b', 'a || b -> a', 'a || b -> true'],
      setup: { settings: { timeouts: true } },
    },
    {
      expected: ['a || b -> b', 'a || b -> a', 'a || b -> true'],
      setup: { preset: 'strict' },
    },
  ])(
    'emits the constant that keeps a loop running with $setup',
    ({ expected, setup }) => {
      expect(
        runMutator('logical-operator', 'while (a || b) step()', setup).map(
          formatMutant,
        ),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; expected: string[]; source: string }>([
    {
      source: [
        'function f(count: number | null) {',
        '  x = count ?? 0',
        '}',
      ].join('\n'),
      setup: {
        mutators: { 'logical-operator': ['on', { nullishSwap: 'always' }] },
      },
      expected: ['count ?? 0 -> count', 'count ?? 0 -> count || 0'],
    },
    {
      source: [
        'function f(count: number | null) {',
        '  x = count ?? 0',
        '}',
      ].join('\n'),
      expected: ['count ?? 0 -> count', 'count ?? 0 -> count || 0'],
      setup: { preset: 'strict' },
    },
    {
      setup: {
        mutators: { 'logical-operator': ['on', { nullishSwap: 'always' }] },
      },
      expected: ['value || 0 -> 0', 'value || 0 -> value ?? 0'],
      source: 'x = value || 0',
    },
    {
      setup: {
        mutators: {
          'logical-operator': ['on', { nullishNormalization: true }],
        },
      },
      source: [
        'function f(x: string | undefined) {',
        '  y = x ?? null',
        '}',
      ].join('\n'),
      expected: ['x ?? null -> x', 'x ?? null -> x || null'],
    },
    {
      source: [
        'function f(x: string | undefined) {',
        '  y = x ?? null',
        '}',
      ].join('\n'),
      expected: ['x ?? null -> x', 'x ?? null -> x || null'],
      setup: { preset: 'strict' },
    },
  ])(
    'applies the options of $setup to $source',
    ({ expected, source, setup }) => {
      expect(
        runMutator('logical-operator', source, setup).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      source: ['for (;;) {', '  if (a || b) break', '  step()', '}'].join('\n'),
      expected: ['a || b -> b', 'a || b -> a'],
    },
    {
      source: ['for (;;) {', '  if (!(a && b)) break', '  step()', '}'].join(
        '\n',
      ),
      expected: ['a && b -> b', 'a && b -> a'],
    },
    {
      source: ['for (;;) {', '  step()', '  if (a && b) break', '}'].join('\n'),
      expected: ['a && b -> b', 'a && b -> a', 'a && b -> false'],
    },
  ])(
    'leaves the leave-now constant of a first exit test to condition in $source',
    ({ expected, source }) => {
      expect(
        runMutator('logical-operator', source, {
          settings: { timeouts: true },
        }).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; expected: string[]; lines: string[] }>([
    {
      expected: ['a > 0 && isActive -> a > 0'],
      lines: ['if (a > 0 && isActive) run()'],
      setup: {},
    },
    {
      expected: [
        'a > 0 && isActive -> isActive',
        'a > 0 && isActive -> a > 0',
        'a > 0 && isActive -> false',
      ],
      lines: [
        '// mootant-ignore-next-line comparison-operator: boundary is fixed',
        'if (a > 0 && isActive) run()',
      ],
      setup: {},
    },
    {
      expected: [
        'a > 0 && isActive -> isActive',
        'a > 0 && isActive -> a > 0',
        'a > 0 && isActive -> false',
      ],
      setup: { mutators: { 'comparison-operator': 'off' } },
      lines: ['if (a > 0 && isActive) run()'],
    },
    {
      lines: [
        '// mootant-ignore-next-line: legacy',
        'if (a > 0 && isActive) run()',
      ],
      expected: ['a > 0 && isActive -> a > 0'],
      setup: {},
    },
  ])(
    'skips drops a running comparison subsumes, $lines',
    ({ expected, setup, lines }) => {
      expect(
        runMutator('logical-operator', lines.join('\n'), setup).map(
          formatMutant,
        ),
      ).toStrictEqual(expected)
    },
  )

  it('keeps an ignored drop ignored when its justification is ignored too', () => {
    let source = [
      '// mootant-ignore-next-line: legacy',
      'if (a > 0 && isActive) run()',
    ].join('\n')

    expect(
      runMutator('logical-operator', source).map(mutant => mutant.status),
    ).toStrictEqual(['Ignored'])
  })

  it.each<{ setup: MutatorSetup; expected: string[]; lines: string[] }>([
    {
      expected: [
        [
          'x === 0 &&',
          '    y > 3 &&',
          '    isOk(z) -> x === 0 &&',
          '    y > 3',
        ].join('\n'),
      ],
      lines: [
        'function f(x, y, z) {',
        '  return x === 0 &&',
        '    y > 3 &&',
        '    isOk(z)',
        '}',
      ],
      setup: {},
    },
    {
      expected: [
        [
          'x === 0 &&',
          '    // mootant-ignore-next-line comparison-operator: bound is fixed',
          '    y > 3 &&',
          '    isOk(z) -> x === 0 &&',
          '    // mootant-ignore-next-line comparison-operator: bound is fixed',
          '    y > 3',
        ].join('\n'),
        [
          'x === 0 &&',
          '    // mootant-ignore-next-line comparison-operator: bound is fixed',
          '    y > 3 &&',
          '    isOk(z) -> false',
        ].join('\n'),
        [
          'x === 0 &&',
          '    // mootant-ignore-next-line comparison-operator: bound is fixed',
          '    y > 3 -> x === 0',
        ].join('\n'),
      ],
      lines: [
        'function f(x, y, z) {',
        '  return x === 0 &&',
        '    // mootant-ignore-next-line comparison-operator: bound is fixed',
        '    y > 3 &&',
        '    isOk(z)',
        '}',
      ],
      setup: {},
    },
  ])(
    'brings back the group constant when the shifted literal is ignored, $lines',
    ({ expected, setup, lines }) => {
      let file = 'example.js'

      expect(
        runMutator('logical-operator', lines.join('\n'), {
          ...setup,
          file,
        }).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it('keeps the constant of the first comparison skipped when its group returns', () => {
    let source = [
      'function f(x, y, z) {',
      '  return x === 0 &&',
      '    // mootant-ignore-next-line comparison-operator: bound is fixed',
      '    y > 3 &&',
      '    isOk(z)',
      '}',
    ].join('\n')

    expect(
      runMutator('comparison-operator', source, { file: 'example.js' }).map(
        formatMutant,
      ),
    ).toStrictEqual([
      'x === 0 -> x <= 0',
      'x === 0 -> x >= 0',
      'y > 3 -> y >= 3',
      'y > 3 -> y != 3',
      'y > 3 -> y > 4',
    ])
  })

  it.each<{ setup: MutatorSetup; expected: string[]; situation: string }>([
    { situation: 'the swap runs', expected: [], setup: {} },
    {
      setup: { mutators: { 'logical-operator': 'off' } },
      situation: 'logical-operator is off',
      expected: ["'anon' -> ''"],
    },
  ])(
    'leaves an emptied default of a nullable side to the swap while $situation',
    ({ expected, setup }) => {
      let source = [
        'function f(name: string | undefined) {',
        "  x = name || 'anon'",
        '}',
      ].join('\n')

      expect(
        runMutator('string-literal', source, setup).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; situation: string }>([
    { situation: 'it runs', setup: {} },
    {
      setup: { mutators: { 'logical-operator': 'off' } },
      situation: 'it is off',
    },
  ])(
    'owns the emptied default of a side that is never nullish while $situation',
    ({ setup }) => {
      let source = [
        'function f(title: string) {',
        "  x = title || 'untitled'",
        '}',
      ].join('\n')

      expect(runMutator('string-literal', source, setup)).toStrictEqual([])
    },
  )

  it('owns the truth of a literal operand in boolean mode', () => {
    expect(
      runMutator('boolean-literal', 'if (ok && true) run()'),
    ).toStrictEqual([])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['a || b -> b', 'a || b -> a', 'a || b -> true'],
      source: 'k = !(a || b)',
    },
    {
      expected: [
        "a && s.includes('x') -> s.includes('x')",
        "a && s.includes('x') -> a",
        "a && s.includes('x') -> false",
      ],
      source: "if (a && s.includes('x')) run()",
    },
    {
      expected: [
        'ok && await check() -> await check()',
        'ok && await check() -> ok',
        'ok && await check() -> false',
      ],
      source: 'async function f() { if (ok && await check()) stop() }',
    },
  ])(
    'owns the truth of the operands that other mutators leave in $source',
    ({ expected, source }) => {
      expect(
        runMutator('logical-operator', source).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; lines: string[] }>([
    {
      expected: [
        "(a ?? '') && c -> c",
        "(a ?? '') && c -> (a ?? '')",
        "a ?? '' -> a",
        "a ?? '' -> a || ''",
      ],
      lines: [
        'declare let a: number | undefined, c: string',
        "let v = (a ?? '') && c",
      ],
    },
    {
      expected: [
        "(a ?? '') || b -> b",
        "(a ?? '') || b -> (a ?? '')",
        "a ?? '' -> a",
        "a ?? '' -> a || ''",
      ],
      lines: [
        'declare let a: number | undefined, b: string | undefined',
        "let v = (a ?? '') || b",
      ],
    },
  ])(
    'reads no direction from a ?? in a value position in $lines',
    ({ expected, lines }) => {
      expect(
        runMutator('logical-operator', lines.join('\n')).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<[string, string[]]>([
    [
      'function f(title: string, count: number | null, name: string | null) { x = title || ""; y = count ?? 0; z = name || "a" }',
      [
        'title || "" -> title (equivalent canonical-falsy-default)',
        'count ?? 0 -> count || 0 (noise nullish-swap)',
        'name || "a" -> name (subsumed swap-subsumes-drop)',
      ],
    ],
    [
      'function f(a, b) { if (b && a > 0) run() }',
      ['b && a > 0 -> b (subsumed R2)', 'b && a > 0 -> false (subsumed R2)'],
    ],
    ['while (a || b) step()', ['a || b -> true (timeout loop-running)']],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('logical-operator', source)).toStrictEqual(expected)
  })
})
