import { describe, expect, it } from 'vitest'

import { trackMetaDefines } from '../../../../adapters/vitest/worker/track-meta-defines'

/**
 * Key under which Vite's module runner gives a module its `import.meta`.
 */
const IMPORT_META_KEY = '__vite_ssr_import_meta__'

/**
 * Module evaluator as the test drives it.
 */
interface FakeEvaluator {
  /**
   * Runs a module with its context.
   */
  runInlinedModule(
    context: Record<string, unknown>,
    code: string,
    module: unknown,
  ): Promise<unknown>
}

/**
 * Runs a module with a fresh `import.meta`, as Vite's module runner does.
 *
 * @param evaluator - Runs the module.
 * @param code - Text of the module, which names its URL too.
 * @returns The `import.meta` of the module.
 */
async function runModule(
  evaluator: FakeEvaluator,
  code: string,
): Promise<Record<string, unknown>> {
  let meta: Record<string, unknown> = { url: `file:///${code}.ts` }
  await evaluator.runInlinedModule({ [IMPORT_META_KEY]: meta }, code, {})
  return meta
}

/**
 * Creates an evaluator that records the code of every module it runs.
 *
 * @param runs - Receives the code of each module.
 * @returns Evaluator that resolves with the code it ran.
 */
function createEvaluator(runs: string[]): FakeEvaluator {
  return {
    runInlinedModule: (_context, code) => {
      runs.push(code)
      return Promise.resolve(code)
    },
  }
}

describe('trackMetaDefines', () => {
  it('takes the defines out of metaDefines and gives each module them on import.meta, watched until the first read reports one', async () => {
    let names: string[] = []
    let runs: string[] = []
    let evaluator = createEvaluator(runs)
    let state = { metaDefines: { 'app.name': 'a', version: '1', other: 2 } }

    expect(
      trackMetaDefines(
        state,
        { evaluator },
        {
          record: name => {
            names.push(name)
          },
          keys: ['import.meta.version', 'import.meta.app.name'],
        },
      ),
    ).toBe(true)
    expect(state.metaDefines).toStrictEqual({ other: 2 })

    let first = await runModule(evaluator, 'first')
    let app = first['app'] as Record<string, unknown>

    expect(names).toStrictEqual([])
    expect(first['version']).toBe('1')
    expect(app['name']).toBe('a')
    expect(names).toStrictEqual([
      'define=import.meta.version',
      'define=import.meta.app.name',
    ])

    let second = await runModule(evaluator, 'second')

    expect(Object.getOwnPropertyDescriptor(second, 'version')).toStrictEqual({
      configurable: true,
      enumerable: true,
      writable: true,
      value: '1',
    })
    expect(second['url']).toBe('file:///second.ts')
    expect(runs).toStrictEqual(['first', 'second'])
  })

  it('changes nothing and says so without an evaluator to wrap or with a define that is not in metaDefines', () => {
    let state = { metaDefines: { version: '1' } }
    let evaluator = createEvaluator([])
    let { runInlinedModule } = evaluator
    let input = { keys: ['import.meta.version'], record: () => {} }

    expect(trackMetaDefines(state, undefined, input)).toBe(false)
    expect(trackMetaDefines(state, {}, input)).toBe(false)
    expect(
      trackMetaDefines(
        state,
        { evaluator },
        { keys: ['import.meta.missing'], record: () => {} },
      ),
    ).toBe(false)
    expect(trackMetaDefines({}, { evaluator }, input)).toBe(false)
    expect(state.metaDefines).toStrictEqual({ version: '1' })
    expect(evaluator.runInlinedModule).toBe(runInlinedModule)
  })

  it('installs once per worker state and gives what code reads to the latest receiver only', async () => {
    let first: string[] = []
    let second: string[] = []
    let evaluator = createEvaluator([])
    let state = { metaDefines: { version: '1' } }
    trackMetaDefines(
      state,
      { evaluator },
      {
        record: name => {
          first.push(name)
        },
        keys: ['import.meta.version'],
      },
    )
    let { runInlinedModule } = evaluator

    expect(
      trackMetaDefines(state, undefined, {
        record: name => {
          second.push(name)
        },
        keys: ['import.meta.version'],
      }),
    ).toBe(true)

    let meta = await runModule(evaluator, 'module')

    expect(meta['version']).toBe('1')
    expect(evaluator.runInlinedModule).toBe(runInlinedModule)
    expect(first).toStrictEqual([])
    expect(second).toStrictEqual(['define=import.meta.version'])
  })
})
