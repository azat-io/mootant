import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { listMutantTexts } from '../../helpers/list-mutant-texts'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('statementRemoval', () => {
  it.each([
    'save(x)',
    'delete cache[key]',
    'callback?.()',
    'void schedule()',
    'void new Worker(file)',
    'void cb?.()',
    'setTimeout(run, 100)',
    `throw new Error(\`bad \${id}\`)`,
    'new Worker(file)',
    '(save(x))',
  ])('removes %s', code => {
    expect(listMutantTexts('statement-removal', [code])).toStrictEqual([
      `${code} -> ;`,
    ])
  })

  it.each([
    { preset: 'recommended', expected: [] },
    { expected: ['setEnabled(state, false) -> ;'], preset: 'strict' },
  ])(
    'keeps a removal that holds a finer mutant only in $preset',
    ({ expected, preset }) => {
      expect(
        listMutantTexts('statement-removal', ['setEnabled(state, false)'], {
          preset,
        }),
      ).toStrictEqual(expected)
    },
  )

  it('removes a void await', () => {
    expect(
      listMutantTexts('statement-removal', [
        'declare let items: number[]',
        'void (await items)',
      ]),
    ).toStrictEqual(['void (await items) -> ;'])
  })

  it('removes an assignment of a string', () => {
    expect(
      listMutantTexts('statement-removal', [
        'declare let label: string',
        'declare let suffix: string',
        'label += suffix',
      ]),
    ).toStrictEqual(['label += suffix -> ;'])
  })

  it('removes a plain assignment next to the mutants of its value', () => {
    expect(
      listMutantTexts('statement-removal', [
        'declare let s: { enabled: boolean }',
        's.enabled = false',
      ]),
    ).toStrictEqual(['s.enabled = false -> ;'])
  })

  it('leaves a compound assignment to the mutants inside it', () => {
    expect(
      listMutantTexts('statement-removal', ['let count = 0', 'count += 2']),
    ).toStrictEqual([])
  })

  it('removes a logging call like any call', () => {
    expect(
      listMutantTexts('statement-removal', ['console.log(x)']),
    ).toStrictEqual(['console.log(x) -> ;'])
  })

  it('marks a removal as a block mutant', () => {
    expect(runMutator('statement-removal', 'save(x)')).toMatchObject([
      { original: 'save(x)', replacement: ';', kind: 'block' },
    ])
  })

  it.each([
    "emit('done', x)",
    'async function f() { await flush() }',
    'if (x) notify(x)',
    'if (x) { notify(x) }',
    'l: save(x)',
    'let a = f()',
    'a + b',
    'x',
    'a(), b()',
    'a?.b',
    '!f()',
    'void x',
    'void a?.b',
    'class B extends A { constructor() { super() } }',
  ])('does not remove %s', code => {
    expect(listMutantTexts('statement-removal', [code])).toStrictEqual([])
  })

  it('removes an update once update-operator is ignored', () => {
    let source = [
      'let count = 0',
      'count++',
      '// mootant-ignore-next-line update-operator',
      'count++',
    ].join('\n')

    expect(runMutator('statement-removal', source)).toMatchObject([
      { original: 'count++', status: 'Pending', replacement: ';', line: 4 },
    ])
  })

  it.each([
    { expected: ['run() -> ;'], lines: ['if (1) run()'] },
    {
      lines: ['if (x) {', '  notify(x)', '  audit(x)', '}'],
      expected: ['notify(x) -> ;', 'audit(x) -> ;'],
    },
    {
      expected: ['notify(x) -> ;', 'ignore(x) -> ;'],
      lines: ['if (x) notify(x)', 'else ignore(x)'],
    },
    {
      lines: [
        'switch (x) {',
        "  case 'a':",
        '    first()',
        '    break',
        "  case 'b':",
        '    second()',
        '}',
      ],
      expected: ['first() -> ;', 'break -> ;', 'second() -> ;'],
    },
    {
      lines: [
        'function f(x) {',
        '  if (x > 1) {',
        '    save(x)',
        '    return null',
        '  }',
        '  return x',
        '}',
      ],
      expected: ['save(x) -> ;', 'return null -> ;'],
    },
    {
      lines: [
        'function f(kind) {',
        '  switch (kind) {',
        "    case 'a':",
        '      return null',
        "    case 'b':",
        '      second()',
        '  }',
        '}',
      ],
      expected: ['return null -> ;', 'second() -> ;'],
    },
    {
      lines: ['function f(x) {', '  save(x)', '  return null', '}'],
      expected: ['save(x) -> ;'],
    },
    {
      lines: [
        'class A {',
        '  name = 1',
        '  setName(n) {',
        '    this.name = n',
        '    return this',
        '  }',
        '}',
      ],
      expected: ['this.name = n -> ;', 'return this -> ;'],
    },
  ])('removes the statements of $lines', ({ expected, lines }) => {
    expect(listMutantTexts('statement-removal', lines)).toStrictEqual(expected)
  })

  it.each<{ setup: MutatorSetup; lines: string[] }>([
    {
      lines: ['// mootant-ignore-next-line condition', 'if (x) notify(x)'],
      setup: {},
    },
    { setup: { mutators: { condition: 'off' } }, lines: ['if (x) notify(x)'] },
  ])(
    'leaves a forced then-branch to the owner of the test',
    ({ setup, lines }) => {
      expect(listMutantTexts('statement-removal', lines, setup)).toStrictEqual(
        [],
      )
    },
  )

  it('skips a then-branch while a comparison moves the test toward false', () => {
    expect(
      listMutantTexts('statement-removal', ['if (x > 1) save(x)']),
    ).toStrictEqual([])
  })

  it.each<{ setup: MutatorSetup; lines: string[] }>([
    {
      lines: [
        '// mootant-ignore-next-line comparison-operator, condition',
        'if (x > 1) save(x)',
      ],
      setup: {},
    },
    {
      setup: { mutators: { 'comparison-operator': 'off', condition: 'off' } },
      lines: ['if (x > 1) save(x)'],
    },
  ])('removes a then-branch nothing else forces', ({ setup, lines }) => {
    expect(
      runMutator('statement-removal', lines.join('\n'), setup),
    ).toMatchObject([{ original: 'save(x)', status: 'Pending' }])
  })

  it.each([
    'return',
    'return undefined',
    'return void 0',
    'return void x',
    'return null',
    'return false',
  ])('keeps a final %s', code => {
    expect(
      listMutantTexts('statement-removal', [
        'function f() {',
        '  run()',
        `  ${code}`,
        '}',
      ]),
    ).toStrictEqual(['run() -> ;'])
  })

  it.each([
    {
      lines: [
        'function f() {',
        '  if (x) {',
        '    run()',
        '  } else {',
        '    return',
        '  }',
        '}',
      ],
      expected: ['run() -> ;'],
    },
    { lines: ['function f() {', '  return g()', '}'], expected: [] },
    {
      lines: [
        'function f(kind) {',
        '  switch (kind) {',
        "    case 'a':",
        '      run()',
        '      return',
        '  }',
        '}',
      ],
      expected: ['run() -> ;'],
    },
    {
      lines: [
        'function f(kind) {',
        '  switch (kind) {',
        "    case 'a':",
        '      return run()',
        '    default:',
        '      return null',
        '  }',
        '}',
      ],
      expected: [],
    },
  ])('keeps the return of $lines', ({ expected, lines }) => {
    expect(listMutantTexts('statement-removal', lines)).toStrictEqual(expected)
  })

  it.each([
    'return',
    'return function () {}',
    'return class {}',
    'return () => {}',
    'return void g()',
  ])('removes the early %s', code => {
    expect(
      listMutantTexts('statement-removal', [
        'function f() {',
        '  if (x) {',
        '    run()',
        `    ${code}`,
        '  }',
        '  done()',
        '}',
      ]),
    ).toContain(`${code} -> ;`)
  })

  it('removes an early return of a negative number', () => {
    expect(
      listMutantTexts(
        'statement-removal',
        [
          'function f() {',
          '  if (x) {',
          '    run()',
          '    return -1',
          '  }',
          '  done()',
          '}',
        ],
        {
          mutators: { 'number-literal': 'off', 'unary-operator': 'off' },
        },
      ),
    ).toContain('return -1 -> ;')
  })

  it('removes a final return of an effect', () => {
    expect(
      listMutantTexts('statement-removal', [
        'function f() {',
        '  run()',
        '  return void g()',
        '}',
      ]),
    ).toStrictEqual(['run() -> ;', 'return void g() -> ;'])
  })

  it.each([
    [
      [
        'switch (x) {',
        '  case 1:',
        '    a()',
        '    break',
        '  case 2:',
        '    break',
        '}',
      ],
    ],
    [
      [
        'switch (x) {',
        '  case 1:',
        '    a()',
        '    break',
        '  case 2: {',
        '    break',
        '  }',
        '}',
      ],
    ],
    [['switch (x) {', '  case 1:', '    a()', '    break', '  case 2:', '}']],
    [['switch (x) {', '  case 1: {', '    a()', '    break', '  }', '}']],
  ])('keeps a case break that falls through to a break in %j', lines => {
    expect(listMutantTexts('statement-removal', lines)).toStrictEqual([
      'a() -> ;',
    ])
  })

  it.each([
    [
      [
        'switch (x) {',
        '  case 1:',
        '    a()',
        '    break',
        '  case 2: {}',
        '}',
      ],
    ],
    [
      [
        'switch (x) {',
        '  case 1:',
        '    a()',
        '    break',
        '  case 2:',
        '  case 3:',
        '    b()',
        '}',
      ],
    ],
    [
      [
        'outer: switch (x) {',
        '  case 1:',
        '    a()',
        '    break',
        '  case 2:',
        '    break outer',
        '}',
      ],
    ],
    [
      [
        'switch (x) {',
        '  case 1: {',
        '    a()',
        '    break',
        '  }',
        '  case 2:',
        '    b()',
        '}',
      ],
    ],
  ])('removes a case break that falls through in %j', lines => {
    expect(listMutantTexts('statement-removal', lines)).toContain('break -> ;')
  })

  it.each([
    {
      lines: [
        'for (const x of xs) {',
        '  if (x) {',
        '    a()',
        '    break',
        '  }',
        '  b()',
        '}',
      ],
      expected: ['a() -> ;', 'b() -> ;'],
    },
    {
      lines: [
        'switch (x) {',
        '  case 1:',
        '    a()',
        '    {',
        '      break',
        '    }',
        '  case 2:',
        '    b()',
        '}',
      ],
      expected: ['a() -> ;', 'b() -> ;'],
    },
    {
      lines: [
        'for (const x of xs) {',
        '  if (x) {',
        '    a()',
        '    continue',
        '  }',
        '  b()',
        '}',
      ],
      expected: ['a() -> ;', 'b() -> ;'],
    },
    { lines: ['function* g() {', '  yield x', '}'], expected: [] },
  ])(
    'keeps the jumps of $lines in the recommended preset',
    ({ expected, lines }) => {
      expect(listMutantTexts('statement-removal', lines)).toStrictEqual(
        expected,
      )
    },
  )

  it.each([
    {
      lines: [
        'for (const x of xs) {',
        '  if (x) {',
        '    a()',
        '    break',
        '  }',
        '  b()',
        '}',
      ],
      expected: 'break -> ;',
    },
    {
      lines: [
        'for (const x of xs) {',
        '  if (x) {',
        '    a()',
        '    continue',
        '  }',
        '  b()',
        '}',
      ],
      expected: 'continue -> ;',
    },
    {
      lines: [
        'outer: for (const x of xs) {',
        '  for (const y of x) {',
        '    a()',
        '    continue outer',
        '  }',
        '}',
      ],
      expected: 'continue outer -> ;',
    },
    {
      lines: [
        'outer: for (const x of xs) {',
        '  for (const y of x) {',
        '    a()',
        '    break outer',
        '  }',
        '}',
      ],
      expected: 'break outer -> ;',
    },
    { lines: ['function* g() {', '  yield x', '}'], expected: 'yield x -> ;' },
  ])('removes the jump of $lines with jumps', ({ expected, lines }) => {
    expect(
      listMutantTexts('statement-removal', lines, {
        mutators: { 'statement-removal': ['on', { jumps: true }] },
      }),
    ).toContain(expected)
  })

  it.each([
    {
      lines: ['for (const x of xs) {', '  a()', '  continue', '}'],
      expected: ['a() -> ;'],
    },
    { lines: ['for (const x of xs) continue'], expected: [] },
    {
      lines: ['outer: for (const x of xs) {', '  a()', '  continue outer', '}'],
      expected: ['a() -> ;'],
    },
  ])(
    'keeps a continue that ends the loop body in $lines',
    ({ expected, lines }) => {
      expect(
        listMutantTexts('statement-removal', lines, { preset: 'strict' }),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; lines: string[] }>([
    {
      lines: [
        '// mootant-ignore-next-line string-literal: event name',
        "emitter.emit('change', value)",
      ],
      setup: {},
    },
    {
      setup: { mutators: { 'string-literal': 'off' } },
      lines: ["emitter.emit('change', value)"],
    },
  ])('removes a call whose inner mutants do not run', ({ setup, lines }) => {
    expect(
      runMutator('statement-removal', lines.join('\n'), setup),
    ).toMatchObject([
      { original: "emitter.emit('change', value)", status: 'Pending' },
    ])
  })

  it('drops a call whose inner mutant runs', () => {
    expect(
      listMutantTexts('statement-removal', ["emitter.emit('change', value)"]),
    ).toStrictEqual([])
  })

  it('removes an awaited call while missing-await is off', () => {
    expect(
      listMutantTexts(
        'statement-removal',
        ['async function f() { await flush() }'],
        {
          mutators: { 'missing-await': 'off' },
        },
      ),
    ).toStrictEqual(['await flush() -> ;'])
  })

  it.each([
    "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(1000)",
    "import { setTimeout } from 'node:timers/promises'\nawait (setTimeout(delay * 2) as Promise<void>)",
    'await scheduler.wait(500)',
    "import { setTimeout as sleep } from 'node:timers/promises'\nawait sleep(100, 'done')",
  ])('skips a statement that only waits for a timer in %s', code => {
    expect(
      listMutantTexts('statement-removal', [code], {
        mutators: { 'missing-await': 'off' },
      }),
    ).toStrictEqual([])
  })

  it.each([
    "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(1000, load())",
    "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(1000, () => {})",
    "import { setInterval } from 'node:timers/promises'\nawait setInterval(1000)",
    'await load(delay)',
    "import { setTimeout as sleep } from 'node:timers/promises'\nawait sleep(100, pendingOperation)",
  ])('removes an awaited statement that does more than wait in %s', code => {
    expect(
      listMutantTexts('statement-removal', [code], {
        mutators: { 'missing-await': 'off' },
      }),
    ).toHaveLength(1)
  })

  it('keeps a statement that advances a loop to the timeouts setting', () => {
    let lines = ['while (queue.length) handle(queue.shift())']

    expect(listMutantTexts('statement-removal', lines)).toStrictEqual([])
    expect(
      listMutantTexts('statement-removal', lines, {
        settings: { timeouts: true },
      }),
    ).toStrictEqual(['handle(queue.shift()) -> ;'])
  })

  it.each<{ setup: MutatorSetup; expected: string[] }>([
    { expected: ['query.filter(isEven) -> ;'], setup: {} },
    {
      setup: { settings: { coarseMutants: false }, preset: 'strict' },
      expected: [],
    },
    { expected: ['query.filter(isEven) -> ;'], setup: { preset: 'strict' } },
  ])(
    'leaves a filter statement to method-call when it runs unless coarse mutants are kept',
    ({ expected, setup }) => {
      expect(
        listMutantTexts(
          'statement-removal',
          [
            'interface Query { filter(f: unknown): Query }',
            'declare let query: Query',
            'query.filter(isEven)',
          ],
          setup,
        ),
      ).toStrictEqual(expected)
    },
  )

  it('removes the write of a returned local before the return value', () => {
    expect(
      listMutantTexts(
        'statement-removal',
        [
          'function total(xs) {',
          '  let sum = 0',
          '  for (const x of xs) sum += x',
          '  return sum',
          '}',
        ],
        {
          mutators: { 'assignment-operator': 'off', 'number-literal': 'off' },
          file: 'example.js',
        },
      ),
    ).toStrictEqual(['sum += x -> ;'])
  })

  it.each<{ expected: string; lines: string[] }>([
    {
      lines: ['while (a < 100) {', '  [a, b] = [b, a + b]', '}'],
      expected: '[a, b] = [b, a + b] -> ;',
    },
    {
      lines: [
        'declare let reader: { read(): Promise<{ done: boolean; value: string }> }',
        'async function f() {',
        '  let done = false',
        "  let value = ''",
        '  while (!done) {',
        '    ({ done, value } = await reader.read())',
        '  }',
        '}',
      ],
      expected: '({ done, value } = await reader.read()) -> ;',
    },
  ])(
    'keeps a destructuring assignment that advances a loop to the timeouts setting in $lines',
    ({ expected, lines }) => {
      expect(listMutantTexts('statement-removal', lines)).toStrictEqual([])
      expect(
        listMutantTexts('statement-removal', lines, {
          settings: { timeouts: true },
        }),
      ).toStrictEqual([expected])
    },
  )

  it.each<[string, string[]]>([
    [
      'switch (x) { case 1: go(); break; case 2: break }',
      [
        'break; -> ; (equivalent fall-through-break)',
        'break -> ; (equivalent fall-through-break)',
      ],
    ],
    ['lbl: go()', ['go() -> ; (invalid invalid-target)']],
    ['if (x > 1) go()', ['go() -> ; (subsumed R4)']],
    [
      'function f() { if (x) return false; return false }',
      [
        'return false; -> ; (owned O19)',
        'return false -> ; (noise tail-return-false)',
      ],
    ],
    ['function f() { go(); return }', ['return -> ; (equivalent tail-return)']],
    ['while (i < n) { i++ }', ['i++ -> ; (timeout loop-advance)']],
    ['go()', []],
    [
      "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(1000)",
      ['await setTimeout(1000) -> ; (noise timer-delay)'],
    ],
    [
      'await scheduler.wait(1000, { signal })',
      ['await scheduler.wait(1000, { signal }) -> ; (subsumed solitary)'],
    ],
    [
      "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(1000, undefined, options)",
      ['await setTimeout(1000, undefined, options) -> ; (subsumed solitary)'],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('statement-removal', source)).toStrictEqual(expected)
  })

  it.each<[string, string[]]>([
    [
      'for (const i of items) { use(i); continue }',
      ['continue -> ; (equivalent loop-end)'],
    ],
  ])('lists the skipped mutants of %s with jumps', (source, expected) => {
    expect(
      listSkipped('statement-removal', source, {
        mutators: { 'statement-removal': ['on', { jumps: true }] },
      }),
    ).toStrictEqual(expected)
  })
})
