import { describe, expect, it } from 'vitest'

import { generateCandidates } from '../../helpers/generate-candidates'
import { listMutantTexts } from '../../helpers/list-mutant-texts'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('missingAwait', () => {
  it.each([
    {
      expected: ['await load(id) -> load(id)'],
      body: ['let user = await load(id)'],
    },
    {
      expected: ['await save(user) -> save(user)'],
      body: ['await save(user)'],
    },
    {
      expected: ['await exists(id) -> exists(id)'],
      body: ['if (await exists(id)) run()'],
    },
    { body: ['return await fetchName(user)'], expected: [] },
    { body: ['const user = await api.get(id)', 'return user'], expected: [] },
    {
      body: ['try {', '  return await risky()', '} catch {', '  retry()', '}'],
      expected: ['await risky() -> risky()'],
    },
    { body: ['const x = await 5'], expected: [] },
    {
      body: ['using r = open()', 'return await r.read()'],
      expected: ['await r.read() -> r.read()'],
    },
    {
      expected: ['await client.search(query) -> client.search(query)'],
      body: ['let hits = await client.search(query)'],
    },
    { body: ['if ((await count()) === 0) stop()'], expected: [] },
    { body: ["let yes = (await ask()) === 'y'"], expected: [] },
  ])('mutates the catalog example $body', ({ expected, body }) => {
    expect(
      listMutantTexts('missing-await', [
        "import { client } from './client'",
        'async function run(id: string) {',
        ...body,
        '}',
      ]),
    ).toStrictEqual(expected)
  })

  it.each([
    'let f = async () => await load()',
    'async function f() { try { g() } catch { h() } return await load() }',
    'async function f() { switch (x) { case 1: return await load() } }',
    'async function f() { const v = g(), u = await load(); return u }',
    'async function* f(ids) { for (const id of ids) yield await load(id) }',
    'async function* f() { try { yield await load() } catch { g() } }',
    'async function* f() { yield (await load()) as T }',
  ])('skips an await the caller does the same in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([])
  })

  it.each([
    'let f = async () => { try { return await load() } finally { done() } }',
    'let f = async () => { try { a() } catch { return await load() } finally { b() } }',
    'let f = async () => { await using r = open(); if (r) { return await load() } }',
    'let f = async () => { try { const u = await load(); return u } catch { b() } }',
    'let f = async () => { using r = open(); const u = await load(); return u }',
    'async function f(rs) { for (await using r of rs) { return await load() } }',
    'async function f(rs) { for (using r of rs) return await load() }',
    'async function f(r0) { for (using r = r0; ; ) { return await load() } }',
    'async function f(rs) { for (await using r of rs) { const u = await load(); return u } }',
  ])('keeps an await that settles before the exit in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([
      'await load() -> load()',
    ])
  })

  it.each([
    'async function f() { var u = await load(); return u }',
    'async function f() { let u = await load(); u = 1; return u }',
    'async function f() { const { u } = await load(); return u }',
    'async function f() { const u = await load(); g(u) }',
    'async function f() { const u = await load(); return u.name }',
    'async function f() { for (const u = await load(); ; ) { return u } }',
    'const u = await load(); g(u)',
    'async function f() { const u = await load(), v = g(); return u }',
    'async function f() { const u = await load(); return console.log(u) }',
    "async function f() { const u = await load(); return debug('loaded %o', u) }",
    'async function* f() { const u = await load(); yield u }',
  ])('keeps an await whose local is not simply returned in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([
      'await load() -> load()',
    ])
  })

  it.each([
    'async function* f() { yield* await load() }',
    'async function* f() { yield [await load()] }',
  ])('keeps an await that a yield does not take whole in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([
      'await load() -> load()',
    ])
  })

  it.each([
    'async function f() { const u = await await load(); return u }',
    'async function f() { return await await load() }',
    'let f = async () => await await load()',
    'async function* f() { yield await await load() }',
    'async function f() { const u = await (await load()); return u }',
    'async function f() { return await (await load() as T) }',
    'async function f() { return await await await load() }',
  ])('skips every removal of a nested await the caller does in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([])
  })

  it('keeps the outer removal of a nested await whose value is used', () => {
    expect(
      listMutantTexts('missing-await', [
        'async function f() { use(await await load()) }',
      ]),
    ).toStrictEqual(['await await load() -> await load()'])
  })

  it.each<[string, boolean]>([
    ['async function f() { return await await await load() }', false],
    [
      'async function f() { if ((await await await load()) === 0) stop() }',
      true,
    ],
  ])(
    'names the outer await of each skipped inner one in %s',
    (source, heuristic) => {
      let outer = source.indexOf('await')
      let { skipped } = generateCandidates(source)

      expect(
        skipped
          .filter(
            candidate =>
              candidate.mutator === 'missing-await' &&
              candidate.rule === 'duplicate',
          )
          .map(candidate => ({
            heuristic: candidate.heuristic,
            start: candidate.start,
            by: candidate.by,
          })),
      ).toStrictEqual([
        {
          by: { mutator: 'missing-await', start: outer, id: null },
          start: outer + 6,
          heuristic,
        },
        {
          by: { mutator: 'missing-await', start: outer + 6, id: null },
          start: outer + 12,
          heuristic,
        },
      ])
    },
  )

  it.each([
    'if (!await check()) stop()',
    'if (ok && await check()) stop()',
    'while (await check()) step()',
    'if (await check()) grant()',
  ])('keeps an await in a boolean context in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([
      'await check() -> check()',
    ])
  })

  it.each([
    'let a = (await count()) > 1',
    'let a = 0n <= (await count())',
    'let a = (await name()) !== undefined',
    'let a = (await name()) == null',
    'let a = (await name()) === `x`',
    'let a = (await done()) === true',
  ])('skips an await compared with a primitive in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([])
  })

  it.each([
    "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(1000)",
    "import { setTimeout as sleep } from 'timers/promises'\nawait sleep(delay)",
    "import * as timers from 'node:timers/promises'\nawait timers.setTimeout(1)",
    "import { scheduler } from 'node:timers/promises'\nawait scheduler.wait(500)",
    'await scheduler.wait(500)',
    "import { setTimeout } from 'node:timers/promises'\nvoid (await setTimeout(1))",
    "import { setTimeout as sleep } from 'node:timers/promises'\nawait sleep(100, 'done')",
    "import { setTimeout as sleep } from 'node:timers/promises'\nawait sleep(100, undefined)",
  ])('skips an await that only waits for a timer in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([])
  })

  it.each([
    "import { setTimeout } from 'node:timers/promises'\nlet v = await setTimeout(1, 'v')",
    "import { setInterval } from 'node:timers/promises'\nawait setInterval(1)",
    'await setTimeout(run, 1000)',
    'let setTimeout = load\nawait setTimeout(1000)',
    "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(1000, undefined, { signal })",
    "import { setTimeout } from 'node:timers/promises'\nawait setTimeout(...args)",
    'await scheduler.wait(1000, { signal })',
    "let timers = require('node:timers/promises')\nawait timers.setTimeout(100)",
    "import { setTimeout as sleep } from 'node:timers/promises'\nawait sleep(100, pendingOperation)",
    "import { setTimeout as sleep } from 'node:timers/promises'\nawait sleep(100, load())",
  ])('keeps an await that does more than wait in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toHaveLength(1)
  })

  it.each([
    'let a = (await count()) > limit',
    'let a = (await load()) === other',
    'let a = (await load()) instanceof Error',
    "let a = 'key' in (await load())",
  ])('keeps an await compared with an unknown value in %s', code => {
    expect(
      listMutantTexts('missing-await', ['declare let limit: string', code]),
    ).toHaveLength(1)
  })

  it('keeps an await compared with a literal while comparison-operator is off', () => {
    expect(
      listMutantTexts('missing-await', ['if ((await count()) === 0) stop()'], {
        mutators: { 'comparison-operator': 'off' },
      }),
    ).toStrictEqual(['await count() -> count()'])
  })

  it('keeps an await compared with a literal while comparison-operator is ignored', () => {
    let source = [
      '// mootant-ignore-next-line comparison-operator',
      'if ((await count()) === 0) stop()',
    ].join('\n')

    expect(runMutator('missing-await', source)).toMatchObject([
      { replacement: 'count()', status: 'Pending' },
    ])
  })

  it('adds no entry when the skipped await itself is ignored', () => {
    expect(
      listMutantTexts('missing-await', [
        '// mootant-ignore-next-line missing-await',
        'if ((await count()) === 0) stop()',
      ]),
    ).toStrictEqual([])
  })

  it('leaves an await compared in a boolean-mode operand to logical-operator', () => {
    expect(
      listMutantTexts(
        'missing-await',
        ['if ((await count()) === 0 && ready) stop()'],
        {
          mutators: { 'comparison-operator': 'off' },
        },
      ),
    ).toStrictEqual([])
  })

  it.each([
    ['declare let s: string', 'let a = await s.trim()'].join('\n'),
    ['declare let items: number[]', 'let a = await items'].join('\n'),
    'let a = await (() => 1)',
    'let a = await null',
  ])('skips an await on a value that is not a promise in %s', code => {
    expect(listMutantTexts('missing-await', [code])).toStrictEqual([])
  })

  it.each([
    { expected: ['await items -> items'], file: 'example.js' },
    { file: 'example.ts', expected: [] },
  ])(
    'reads a defaulted parameter as unknown only in JavaScript in $file',
    ({ expected, file }) => {
      expect(
        listMutantTexts(
          'missing-await',
          [
            'async function count(items = []) {',
            '  const result = await items',
            '  return result.length',
            '}',
          ],
          { file },
        ),
      ).toStrictEqual(expected)
    },
  )

  it('keeps an await on a JavaScript variable that a call writes', () => {
    expect(
      listMutantTexts(
        'missing-await',
        [
          'async function f(load) {',
          '  let x = 1',
          '  x = load()',
          '  g(await x)',
          '}',
        ],
        { file: 'example.js' },
      ),
    ).toStrictEqual(['await x -> x'])
  })

  it('keeps an await on a call typed only by its method name', () => {
    expect(
      listMutantTexts('missing-await', ['let a = await cache.has(key)']),
    ).toStrictEqual(['await cache.has(key) -> cache.has(key)'])
  })

  it('keeps an await whose result advances a loop to the timeouts setting', () => {
    let lines = [
      'declare let reader: { read(): Promise<{ done: boolean; value: string }> }',
      'async function f() {',
      '  let done = false',
      "  let value = ''",
      '  while (!done) {',
      '    ({ done, value } = await reader.read())',
      '  }',
      '}',
    ]

    expect(listMutantTexts('missing-await', lines)).toStrictEqual([])
    expect(
      listMutantTexts('missing-await', lines, { settings: { timeouts: true } }),
    ).toStrictEqual(['await reader.read() -> reader.read()'])
  })

  it('skips the inner removal of a nested await that advances a loop', () => {
    let source = [
      'async function f() {',
      '  let done = false',
      '  while (!done) {',
      '    done = await await readDone()',
      '  }',
      '}',
    ].join('\n')

    expect(listSkipped('missing-await', source)).toStrictEqual([
      'await await readDone() -> await readDone() (timeout loop-advance)',
      'await readDone() -> readDone() (duplicate duplicate)',
    ])
    expect(
      listSkipped('missing-await', source, { settings: { timeouts: true } }),
    ).toStrictEqual(['await readDone() -> readDone() (duplicate duplicate)'])
    expect(
      runMutator('missing-await', source, { settings: { timeouts: true } }),
    ).toMatchObject([{ replacement: 'await readDone()' }])
  })

  it.each<[string, string[]]>([
    [
      'async function f() { return await load() }',
      ['await load() -> load() (equivalent awaited-by-caller)'],
    ],
    [
      'async function f() { if ((await load()) === 0) stop() }',
      ['await load() -> load() (subsumed R8)'],
    ],
    [
      'async function f() { if (x && (await load()) === 0) stop() }',
      ['await load() -> load() (owned O3)'],
    ],
    [
      'declare let name: string; async function f() { use(await name) }',
      ['await name -> name (equivalent settled-value)'],
    ],
    ['async function f() { use(await load()) }', []],
    [
      'async function f() { const u = await await load(); return u }',
      [
        'await await load() -> await load() (equivalent awaited-by-caller)',
        'await load() -> load() (duplicate duplicate)',
      ],
    ],
    [
      'async function f() { return await (await load()) }',
      [
        'await (await load()) -> (await load()) (equivalent awaited-by-caller)',
        'await load() -> load() (duplicate duplicate)',
      ],
    ],
    [
      'async function f() { use(await await load()) }',
      ['await load() -> load() (duplicate duplicate)'],
    ],
    [
      "import { setTimeout } from 'node:timers/promises'\nasync function f() { await setTimeout(1000) }",
      ['await setTimeout(1000) -> setTimeout(1000) (noise timer-delay)'],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('missing-await', source)).toStrictEqual(expected)
  })
})
