import { afterEach, describe, expect, it, vi } from 'vitest'

import { trackValues } from '../../../../adapters/vitest/worker/track-values'

/**
 * Worker state as `trackValues` reads it.
 */
interface FakeState {
  /**
   * Context of the run, with its alias of the provided values.
   */
  ctx: { providedContext: object }

  /**
   * Values the main process provided.
   */
  providedContext: object
}

/**
 * Globals the tests define, removed after each test.
 */
const GLOBALS = [
  '__MOOTANT_MISSING__',
  '__MOOTANT_GETTER__',
  '__MOOTANT_FIXED__',
  '__MOOTANT_PLAIN__',
  '__MOOTANT_CODE__',
  '__MOOTANT_TIME__',
  '__MOOTANT_APP__',
]

/**
 * Reads a define as test code does, by its bare name.
 */
declare let __MOOTANT_TIME__: string

/**
 * Creates a worker state whose context holds the provided values.
 *
 * @param provided - Values the main process provided.
 * @returns Worker state.
 */
function createState(provided: Record<string, unknown> = {}): FakeState {
  return { ctx: { providedContext: provided }, providedContext: provided }
}

/**
 * Lets the current synchronous run end, so a listing of the values no longer
 * covers the names read after it.
 */
async function nextRun(): Promise<void> {
  await Promise.resolve()
}

describe('trackValues', () => {
  afterEach(() => {
    /* Cspell:disable-next-line */
    vi.unstubAllGlobals()
    for (let name of GLOBALS) {
      Reflect.deleteProperty(globalThis, name)
    }
  })

  it('reports the provided values code reads, a missing one too, and all of them when it lists them, but never the options of mootant', async () => {
    let names: string[] = []
    let provided = { apiUrl: 'http://127.0.0.1:1', mootant: { mode: 'dry' } }
    let state = createState(provided)
    trackValues(state, { scripted: {}, defines: {} }, name => {
      names.push(name)
    })

    expect(Reflect.get(state.providedContext, 'apiUrl')).toBe(
      'http://127.0.0.1:1',
    )
    expect(Reflect.has(state.providedContext, 'missing')).toBe(false)
    expect(
      Reflect.getOwnPropertyDescriptor(state.providedContext, 'other'),
    ).toBeUndefined()
    expect(Reflect.get(state.providedContext, 'mootant')).toStrictEqual({
      mode: 'dry',
    })
    expect(Reflect.get(state.providedContext, Symbol.iterator)).toBeUndefined()
    expect(names).toStrictEqual([
      'defines=',
      'provide=apiUrl',
      'provide=missing',
      'provide=other',
    ])

    await nextRun()
    names.length = 0

    expect({ ...state.providedContext }).toStrictEqual(provided)
    expect(names).toStrictEqual(['provide=*'])
    expect(state.ctx.providedContext).toBe(state.providedContext)
    expect(state.providedContext).not.toBe(provided)
  })

  it('keeps a define Vitest set as a plain global a getter until code first reads it, which it reports, then gives the plain property back', () => {
    let names: string[] = []
    Reflect.set(globalThis, '__MOOTANT_TIME__', 'now')
    trackValues(
      createState(),
      { defines: { __MOOTANT_TIME__: 'now' }, scripted: {} },
      name => {
        names.push(name)
      },
    )

    expect('__MOOTANT_TIME__' in globalThis).toBe(true)
    expect(Object.keys(globalThis)).toContain('__MOOTANT_TIME__')
    expect(names).toStrictEqual(['defines='])
    expect(typeof __MOOTANT_TIME__).toBe('string')
    expect(__MOOTANT_TIME__).toBe('now')
    expect(names).toStrictEqual(['defines=', 'define=__MOOTANT_TIME__'])
    expect(
      Object.getOwnPropertyDescriptor(globalThis, '__MOOTANT_TIME__'),
    ).toStrictEqual({
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'now',
    })

    Object.defineProperty(globalThis, '__MOOTANT_TIME__', {
      value: 'redefined',
    })
    __MOOTANT_TIME__ = 'written'

    expect(Reflect.get(globalThis, '__MOOTANT_TIME__')).toBe('written')
    expect(names).toStrictEqual(['defines=', 'define=__MOOTANT_TIME__'])
  })

  it('gives the plain property of a define back with what code writes before it reads one, and keeps stubs and deletion', () => {
    let names: string[] = []
    Reflect.set(globalThis, '__MOOTANT_TIME__', 'now')
    Reflect.set(globalThis, '__MOOTANT_PLAIN__', 'p')
    trackValues(
      createState(),
      {
        defines: { __MOOTANT_TIME__: 'now', __MOOTANT_PLAIN__: 'p' },
        scripted: {},
      },
      name => {
        names.push(name)
      },
    )
    Reflect.set(globalThis, '__MOOTANT_PLAIN__', 'later')
    vi.stubGlobal('__MOOTANT_TIME__', 'stub')

    expect(
      Object.getOwnPropertyDescriptor(globalThis, '__MOOTANT_PLAIN__'),
    ).toStrictEqual({
      configurable: true,
      enumerable: true,
      value: 'later',
      writable: true,
    })
    expect(Reflect.get(globalThis, '__MOOTANT_TIME__')).toBe('stub')
    expect(names).toStrictEqual(['defines='])

    /* Cspell:disable-next-line */
    vi.unstubAllGlobals()

    expect(Reflect.get(globalThis, '__MOOTANT_TIME__')).toBe('now')
    expect(names).toStrictEqual(['defines=', 'define=__MOOTANT_TIME__'])
    expect(Reflect.deleteProperty(globalThis, '__MOOTANT_TIME__')).toBe(true)
    expect('__MOOTANT_TIME__' in globalThis).toBe(false)
  })

  it('reports at once the defines that are not plain globals, leaves those of import.meta to trackMetaDefines, and reports every value when a custom snapshot environment may read them before the runner', () => {
    let names: string[] = []
    Object.defineProperties(globalThis, {
      __MOOTANT_FIXED__: { configurable: true, writable: false, value: 2 },
      __MOOTANT_GETTER__: { configurable: true, get: () => 1 },
    })
    let state = createState()
    let defines = {
      __MOOTANT_MISSING__: 3,
      __MOOTANT_GETTER__: 1,
      __MOOTANT_FIXED__: 2,
    }
    let scripted = { 'import.meta.mootantTime': false }
    trackValues(state, { scripted, defines }, name => {
      names.push(name)
    })
    trackValues(state, { scripted, defines }, name => {
      names.push(`again ${name}`)
    })

    expect(Reflect.get(globalThis, '__MOOTANT_GETTER__')).toBe(1)
    expect(Reflect.get(globalThis, '__MOOTANT_FIXED__')).toBe(2)
    expect(names).toStrictEqual([
      'defines=',
      'define=__MOOTANT_MISSING__',
      'define=__MOOTANT_GETTER__',
      'define=__MOOTANT_FIXED__',
      'again defines=',
      'again define=__MOOTANT_MISSING__',
      'again define=__MOOTANT_GETTER__',
      'again define=__MOOTANT_FIXED__',
    ])

    names.length = 0
    Reflect.set(globalThis, '__MOOTANT_PLAIN__', 'p')
    trackValues(
      createState(),
      {
        defines: { __MOOTANT_PLAIN__: 'p', __MOOTANT_GETTER__: 1 },
        snapshotEnvironment: './snapshot-environment.ts',
        scripted,
      },
      name => {
        names.push(name)
      },
    )

    expect(names).toStrictEqual([
      'defines=',
      'provide=*',
      'define=__MOOTANT_PLAIN__',
      'define=__MOOTANT_GETTER__',
      'define=import.meta.mootantTime',
    ])
    expect(Reflect.get(globalThis, '__MOOTANT_PLAIN__')).toBe('p')
    expect(names.at(-1)).toBe('define=__MOOTANT_PLAIN__')
  })

  it('turns a define whose key holds dots into a getter of its last part, on the object Vitest made for it', () => {
    let names: string[] = []
    Reflect.set(globalThis, '__MOOTANT_APP__', { meta: { version: '1' } })
    trackValues(
      createState(),
      {
        scripted: {
          '__MOOTANT_APP__.meta.version': false,
          '__MOOTANT_APP__.x.y': false,
        },
        defines: {},
      },
      name => {
        names.push(name)
      },
    )
    let app = Reflect.get(globalThis, '__MOOTANT_APP__') as {
      meta: { version: string }
    }

    expect(Object.keys(app.meta)).toStrictEqual(['version'])
    expect(names).toStrictEqual(['defines=', 'define=__MOOTANT_APP__.x.y'])
    expect(app.meta.version).toBe('1')
    expect(names.at(-1)).toBe('define=__MOOTANT_APP__.meta.version')
  })

  it('reports at once, with every provided value and environment variable, each define given as code, which Vitest evaluated before the runner existed with whatever it reads or changes', () => {
    let names: string[] = []
    Reflect.set(globalThis, '__MOOTANT_CODE__', 'evaluated')
    trackValues(
      createState(),
      {
        scripted: { 'import.meta.mootantFlag': true, __MOOTANT_CODE__: true },
        defines: {},
      },
      name => {
        names.push(name)
      },
    )

    expect(names).toStrictEqual([
      'defines=',
      'define=import.meta.mootantFlag',
      'provide=*',
      '*',
      'define=__MOOTANT_CODE__',
    ])
    expect(
      Object.getOwnPropertyDescriptor(globalThis, '__MOOTANT_CODE__'),
    ).toStrictEqual({
      configurable: true,
      value: 'evaluated',
      enumerable: true,
      writable: true,
    })
  })

  it('installs once per worker state and gives what code reads to the latest receiver only', () => {
    let first: string[] = []
    let second: string[] = []
    let state = createState({ apiUrl: 'u' })
    Reflect.set(globalThis, '__MOOTANT_TIME__', 'now')
    trackValues(
      state,
      { defines: { __MOOTANT_TIME__: 'now' }, scripted: {} },
      name => {
        first.push(name)
      },
    )
    let proxy = state.providedContext
    let getter = Object.getOwnPropertyDescriptor(
      globalThis,
      '__MOOTANT_TIME__',
    )!.get
    trackValues(
      state,
      { defines: { __MOOTANT_TIME__: 'now' }, scripted: {} },
      name => {
        second.push(name)
      },
    )

    expect(state.providedContext).toBe(proxy)
    expect(
      Object.getOwnPropertyDescriptor(globalThis, '__MOOTANT_TIME__')!.get,
    ).toBe(getter)
    expect(Reflect.get(state.providedContext, 'apiUrl')).toBe('u')
    expect(Reflect.get(globalThis, '__MOOTANT_TIME__')).toBe('now')
    expect(first).toStrictEqual(['defines='])
    expect(second).toStrictEqual([
      'defines=',
      'provide=apiUrl',
      'define=__MOOTANT_TIME__',
    ])
  })
})
