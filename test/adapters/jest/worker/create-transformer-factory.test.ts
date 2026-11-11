import type { Mock } from 'vitest'

import { syncBuiltinESMExports, stripTypeScriptTypes } from 'node:module'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import crypto, { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

import type { WorkerChannel } from '../../../../adapters/jest/types/worker-channel'
import type { WorkerProject } from '../../../../adapters/jest/types/worker-project'
import type { WorkerCalls } from '../../../../adapters/jest/types/worker-calls'
import type { JestRecord } from '../../../../adapters/jest/types/jest-record'

import { createTransformerFactory } from '../../../../adapters/jest/worker/create-transformer-factory'
import { writeSwitchPlan } from '../../../../adapters/shared/write-switch-plan'

/**
 * Methods a real transformer may have that the wrapper passes on.
 */
const METHODS = [
  'getCacheKeyAsync',
  'processAsync',
  'getCacheKey',
  'process',
] as const

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Plan of the current test, in which `/src/a.js` has the text `a + b`.
 */
let plan = ''

/**
 * Plain project of the session.
 */
let project = {
  config: { testRunner: '/plain/runner.js', id: 'p' },
  configString: '{"plain":true}',
} as WorkerProject

/**
 * What Jest passes a transformer: everything about the project copy, and the
 * plan with mootant's paths in its `transformerConfig`.
 */
let options = {
  transformerConfig: { plan: '/work/plan.json', real: '/real.js' },
  config: { wrapped: '/work/jest', id: 'p' },
  configString: '{"wrapped":"/work/jest"}',
  supportsDynamicImport: false,
  instrument: false,
}

/**
 * Creates a factory whose real transformer is the given module.
 *
 * @param real - Module the real path loads to.
 * @param stripTypes - Node's function to strip types, when the Jest of the
 *   session strips them.
 * @returns The factory, what it writes through and how it loads.
 */
function createFactory(
  real: unknown,
  stripTypes: typeof stripTypeScriptTypes | null = null,
): {
  factory: ReturnType<typeof createTransformerFactory>
  load: Mock<(file: string) => Promise<unknown>>
  written: [number, JestRecord][]
  channel: WorkerChannel
  calls: WorkerCalls
} {
  let { written, channel } = createChannel()
  let load = vi.fn(() => Promise.resolve(real))
  let calls = {
    asyncTransformer: new AsyncLocalStorage<true>(),
    asyncResolver: new AsyncLocalStorage<true>(),
    environment: new AsyncLocalStorage<true>(),
    defaultResolver: 0,
    transformer: 0,
    unsettled: 0,
    resolver: 0,
  }
  return {
    factory: createTransformerFactory({
      projects: new Map([['p', project]]),
      requireOrImportModule: load,
      stripTypes,
      channel,
      calls,
    }),
    written,
    channel,
    calls,
    load,
  }
}

/**
 * Creates a channel that collects what is written.
 *
 * @returns The channel and the tokens and records it got.
 */
function createChannel(): {
  written: [number, JestRecord][]
  channel: WorkerChannel
} {
  let written: [number, JestRecord][] = []
  let channel: WorkerChannel = {
    write(token, record) {
      written.push([token, record])
    },
    enterEnvironment() {},
    begin: () => 0,
    unit: null,
    end() {},
    token: 3,
    vm: null,
  }
  return { written, channel }
}

/**
 * Creates a real transformer with the given methods, each giving its name.
 *
 * @param names - Methods it has.
 * @returns The transformer.
 */
function createReal(
  names: readonly (typeof METHODS)[number][],
): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    names.map(name => [
      name,
      vi.fn((text: string) =>
        name.endsWith('Async') ?
          Promise.resolve(`${name}:${text}`)
        : `${name}:${text}`,
      ),
    ]),
  )
}

/**
 * Gives every subset of the methods with a title.
 *
 * @returns Rows of a title and a subset.
 */
function listSubsets(): [string, (typeof METHODS)[number][]][] {
  return Array.from({ length: 2 ** METHODS.length }, (_, bits) => {
    let names = METHODS.filter((_name, index) => (bits >> index) % 2 === 1)
    return [names.join(', ') || 'none of them', names]
  })
}

/**
 * Calls a method of a transformer and gives what it threw or rejected with.
 *
 * @param call - Function that makes the call.
 * @returns The value it failed with, or null.
 */
async function catchFailure(call: () => unknown): Promise<unknown> {
  try {
    await call()
  } catch (error) {
    return error
  }
  return null
}

/**
 * Reads what marks a call into a real transformer.
 *
 * @param calls - Calls running in the worker.
 * @returns The count of the other calls and the store of the asynchronous ones.
 */
function readMarks(calls: WorkerCalls): [number, undefined | true] {
  return [calls.transformer, calls.asyncTransformer.getStore()]
}

describe('createTransformerFactory', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-transformer-'))
    plan = writeSwitchPlan(path.join(directory, 'plan'), [
      { switched: 'a - b', original: 'a + b', file: '/src/a.js' },
    ])
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    await rm(directory, { recursive: true, force: true })
  })

  describe('a transformer entry with no real transformer', () => {
    it('has the methods of a sync transformer that cannot instrument', async () => {
      let { factory, load } = createFactory(null)
      let wrapped = await factory.createTransformer({ real: null, plan })

      expect(Object.keys(wrapped).toSorted()).toStrictEqual([
        'canInstrument',
        'getCacheKey',
        'process',
      ])
      expect(wrapped.canInstrument).toBe(false)
      expect(load).not.toHaveBeenCalled()
    })

    it('gives the switched text, writing nothing', async () => {
      let { factory, written } = createFactory(null)
      let wrapped = await factory.createTransformer({ real: null, plan })

      expect(wrapped.process!('a + b', '/src/a.js', options)).toStrictEqual({
        code: 'a - b',
      })
      expect(wrapped.process!('other', '/src/a.js', options)).toStrictEqual({
        code: 'other',
      })
      expect(wrapped.process!('c', '/src/c.js', options)).toStrictEqual({
        code: 'c',
      })
      expect(written).toStrictEqual([])
    })

    it('makes the same key a real transformer with no key of its own gets', async () => {
      let { factory } = createFactory({ process: vi.fn() })
      let identity = await factory.createTransformer({ real: null, plan })
      let real = await factory.createTransformer({ real: '/real.js', plan })

      expect(identity.getCacheKey('a + b', '/src/a.js', options)).toBe(
        real.getCacheKey('a + b', '/src/a.js', options),
      )
    })
  })

  describe('the entry with no real transformer of a Jest that strips types', () => {
    it("spends Node's warning once on an empty text with warnings off, and puts emitWarning back", async () => {
      let warnings: Error[] = []
      let texts: string[] = []
      let warned = false
      /**
       * Keeps a warning the process emits.
       *
       * @param warning - What the process emitted.
       */
      function keep(warning: Error): void {
        warnings.push(warning)
      }
      /**
       * Strips nothing and warns on its first call, as Node does.
       *
       * @param code - Text to strip.
       * @returns The text.
       */
      function strip(code: string): string {
        texts.push(code)
        if (!warned) {
          warned = true
          process.emitWarning('stripTypeScriptTypes', 'ExperimentalWarning')
        }
        return code
      }
      process.on('warning', keep)
      let { emitWarning } = process
      try {
        let { factory } = createFactory(null, strip)
        let wrapped = await factory.createTransformer({ real: null, plan })
        wrapped.process!('let a: number = 1', '/src/a.ts', options)
        wrapped.process!('let b: number = 1', '/src/b.ts', options)
        await new Promise(resolve => {
          setImmediate(resolve)
        })

        expect(texts).toStrictEqual([
          '',
          'let a: number = 1',
          'let b: number = 1',
        ])
        expect(warnings).toStrictEqual([])
        expect(process.emitWarning).toBe(emitWarning)
      } finally {
        process.off('warning', keep)
      }
    })

    it.each(['/src/a.ts', '/src/a.mts', '/src/a.cts', '/src/a.d.ts'])(
      'erases the types of %s with Node, as plain Jest does',
      async file => {
        let { factory, written } = createFactory(null, stripTypeScriptTypes)
        let wrapped = await factory.createTransformer({ real: null, plan })

        expect(
          wrapped.process!(
            'interface Box { width: number }\nlet box = {} as Box\n',
            file,
            options,
          ),
        ).toStrictEqual({
          code: '                               \nlet box = {}       \n',
        })
        expect(written).toStrictEqual([])
      },
    )

    it('erases the types of the switched text', async () => {
      let typed = writeSwitchPlan(path.join(directory, 'typed'), [
        {
          original: 'let a: number = 1',
          switched: 'let a: number = 2',
          file: '/src/a.ts',
        },
      ])
      let { factory } = createFactory(null, stripTypeScriptTypes)
      let wrapped = await factory.createTransformer({ plan: typed, real: null })

      expect(
        wrapped.process!('let a: number = 1', '/src/a.ts', options),
      ).toStrictEqual({ code: 'let a         = 2' })
    })

    it.each(['/src/a.tsx', '/src/a.js', '/src/ts'])(
      'hands on the text of %s as it is',
      async file => {
        let { factory } = createFactory(null, stripTypeScriptTypes)
        let wrapped = await factory.createTransformer({ real: null, plan })

        expect(wrapped.process!('let a: number', file, options)).toStrictEqual({
          code: 'let a: number',
        })
      },
    )

    it('hands on the text of a TypeScript file on a Jest that does not strip', async () => {
      let { factory } = createFactory(null)
      let wrapped = await factory.createTransformer({ real: null, plan })

      expect(
        wrapped.process!('let a: number', '/src/a.ts', options),
      ).toStrictEqual({ code: 'let a: number' })
    })

    it('puts the version of Node in the key of a file it strips, and nowhere else', async () => {
      let strips = await createFactory(
        null,
        stripTypeScriptTypes,
      ).factory.createTransformer({ real: null, plan: null })
      let keeps = await createFactory(null).factory.createTransformer({
        real: null,
        plan: null,
      })

      expect(strips.getCacheKey('x', '/x.ts', options)).toBe(
        createHash('sha1')
          .update('x')
          .update('{"plain":true}')
          .update('')
          .update('/x.ts')
          .update(process.version)
          .digest('hex'),
      )
      expect(keeps.getCacheKey('x', '/x.ts', options)).toBe(
        createHash('sha1')
          .update('x')
          .update('{"plain":true}')
          .update('')
          .update('/x.ts')
          .digest('hex'),
      )
      expect(strips.getCacheKey('x', '/x.js', options)).toBe(
        keeps.getCacheKey('x', '/x.js', options),
      )
    })

    it("fails in Jest's words with Node's error as the cause, which a switched text makes a rejection", async () => {
      let typed = writeSwitchPlan(path.join(directory, 'typed'), [
        {
          switched: 'enum Size { Small }',
          original: 'let a = 1',
          file: '/a.ts',
        },
      ])
      let { factory, written } = createFactory(null, stripTypeScriptTypes)
      let wrapped = await factory.createTransformer({ plan: typed, real: null })
      let error = (await catchFailure(() =>
        wrapped.process!('let a = 1', '/a.ts', options),
      )) as Error
      let cause = error.cause as { code: string } & Error
      let direct = (await catchFailure(() =>
        stripTypeScriptTypes('enum Size { Small }', { mode: 'strip' }),
      )) as { code: string } & Error

      expect(cause.code).toBe(direct.code)
      expect(cause.code).toMatch(/^ERR_\w+$/u)
      expect(error.message).toBe(
        `jest: failed to strip TypeScript types from /a.ts\n\n${cause.message}\n\nNode.js only erases type annotations - it cannot compile TypeScript features that emit code, such as \`enum\`, \`namespace\` and parameter properties. Configure a \`transform\` using \`@babel/preset-typescript\` or \`ts-jest\` to handle this file.`,
      )
      expect(written).toStrictEqual([
        [
          3,
          {
            message: 'jest: failed to strip TypeScript types from /a.ts',
            kind: 'rejected',
            file: '/a.ts',
          },
        ],
      ])
    })
  })

  describe('a real transformer', () => {
    it.each(listSubsets())(
      'exists only as far as the real one does: %s',
      async (_title, names) => {
        let { factory } = createFactory(createReal(names))
        let wrapped = await factory.createTransformer({
          real: '/real.js',
          realConfig: {},
          plan,
        })

        expect(Object.keys(wrapped).toSorted()).toStrictEqual(
          [
            'canInstrument',
            'getCacheKey',
            ...names.filter(name => name !== 'getCacheKey'),
          ].toSorted(),
        )
      },
    )

    it('loads the real path and uses a module that is no factory as it is', async () => {
      let real = createReal(['process'])
      let { factory, load } = createFactory(real)
      let wrapped = await factory.createTransformer({
        realConfig: { option: 1 },
        real: '/real.js',
        plan,
      })

      expect(load).toHaveBeenCalledExactlyOnceWith('/real.js')
      expect(wrapped.process!('x', '/x.js', options)).toBe('process:x')
      expect(real['process']).toHaveBeenCalledExactlyOnceWith('x', '/x.js', {
        ...options,
        configString: project.configString,
        transformerConfig: { option: 1 },
        config: project.config,
      })
    })

    it('awaits the factory of a module that is one, with its this', async () => {
      let seen: unknown[] = []
      let module = {
        createTransformer(config: unknown) {
          seen.push(this, config)
          return Promise.resolve(createReal(['process']))
        },
      }
      let { factory } = createFactory(module)
      let wrapped = await factory.createTransformer({
        realConfig: { option: 1 },
        real: '/real.js',
        plan,
      })

      expect(seen).toStrictEqual([module, { option: 1 }])
      expect(wrapped.process!('x', '/x.js', options)).toBe('process:x')
    })

    it('takes a transformer a factory gives at once', async () => {
      let real = createReal(['process'])
      let { factory } = createFactory({ createTransformer: () => real })
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan,
      })

      expect(wrapped.process!('x', '/x.js', options)).toBe('process:x')
    })

    it('tells whether the real one instruments, as a boolean', async () => {
      let yes = createFactory({ canInstrument: 1, process: vi.fn() })
      let no = createFactory({ process: vi.fn() })

      await expect(
        yes.factory.createTransformer({ real: '/real.js', plan }),
      ).resolves.toMatchObject({ canInstrument: true })
      await expect(
        no.factory.createTransformer({ real: '/real.js', plan }),
      ).resolves.toMatchObject({ canInstrument: false })
    })

    it('hands the plain options to each method, with no plan and the configString of the project', async () => {
      let real = createReal(METHODS)
      let { factory } = createFactory(real)
      let wrapped = await factory.createTransformer({
        realConfig: { option: 1 },
        real: '/real.js',
        plan,
      })
      wrapped.getCacheKey('a + b', '/src/a.js', options)
      wrapped.process!('a + b', '/src/a.js', options)
      await wrapped.getCacheKeyAsync!('a + b', '/src/a.js', options)
      await wrapped.processAsync!('a + b', '/src/a.js', options)
      let plain = {
        ...options,
        transformerConfig: { option: 1 },
        configString: '{"plain":true}',
        config: project.config,
      }

      for (let name of METHODS) {
        expect(real[name]).toHaveBeenCalledExactlyOnceWith(
          'a - b',
          '/src/a.js',
          plain,
        )
      }
    })

    it('gives the real one the switched text and returns what it returns', async () => {
      let { factory } = createFactory(createReal(METHODS))
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan,
      })

      expect(wrapped.getCacheKey('a + b', '/src/a.js', options)).toBe(
        'getCacheKey:a - b',
      )
      expect(wrapped.process!('a + b', '/src/a.js', options)).toBe(
        'process:a - b',
      )
      await expect(
        wrapped.getCacheKeyAsync!('a + b', '/src/a.js', options),
      ).resolves.toBe('getCacheKeyAsync:a - b')
      await expect(
        wrapped.processAsync!('a + b', '/src/a.js', options),
      ).resolves.toBe('processAsync:a - b')
    })

    it('leaves the text with no plan', async () => {
      let { factory, written } = createFactory(createReal(METHODS))
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan: null,
      })

      expect(wrapped.getCacheKey('a + b', '/src/a.js', options)).toBe(
        'getCacheKey:a + b',
      )
      expect(written).toStrictEqual([])
    })

    it('hands a clone to the factory, so a transformer that changes it leaves the options as they were', async () => {
      let seen: unknown[] = []
      let module = {
        createTransformer(config: { jsc: { hidden?: boolean } }) {
          seen.push(structuredClone(config))
          config.jsc.hidden = true
          return { process: vi.fn() }
        },
      }
      let realConfig = { jsc: {} }
      let { factory } = createFactory(module)
      await factory.createTransformer({ real: '/real.js', realConfig, plan })
      await factory.createTransformer({ real: '/real.js', realConfig, plan })

      expect(realConfig).toStrictEqual({ jsc: {} })
      expect(seen).toStrictEqual([{ jsc: {} }, { jsc: {} }])
    })

    it('gives the method the same options the factory changed', async () => {
      let process = vi.fn()
      let module = {
        createTransformer(config: { changed?: boolean }) {
          config.changed = true
          return { process }
        },
      }
      let { factory } = createFactory(module)
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        realConfig: {},
        plan,
      })
      wrapped.process!('x', '/x.js', options)

      expect(process.mock.calls[0]![2]).toMatchObject({
        transformerConfig: { changed: true },
      })
    })

    it.each([
      '/project/node_modules/ts-jest/dist/index.js',
      String.raw`C:\project\node_modules\ts-jest\dist\index.js`,
      '/project/node_modules/jest-preset-angular/build/index.js',
    ])(
      'turns diagnostics off for ts-jest, alone or in jest-preset-angular, by the path: %s',
      async real => {
        let process = vi.fn()
        let createTransformer = vi.fn(() => ({ process }))
        let { factory } = createFactory({ createTransformer })
        let wrapped = await factory.createTransformer({
          realConfig: { diagnostics: true, tsconfig: 'a' },
          plan,
          real,
        })
        wrapped.process!('x', '/x.js', options)
        let handed = { diagnostics: false, tsconfig: 'a' }

        expect(createTransformer).toHaveBeenCalledExactlyOnceWith(handed)
        expect(process.mock.calls[0]![2]).toMatchObject({
          transformerConfig: handed,
        })
      },
    )

    it('leaves the options of any other path alone', async () => {
      let process = vi.fn()
      let createTransformer = vi.fn(() => ({ process }))
      let { factory } = createFactory({ createTransformer })
      let wrapped = await factory.createTransformer({
        real: '/project/node_modules/not-ts-jest/index.js',
        realConfig: { tsconfig: 'a' },
        plan,
      })
      wrapped.process!('x', '/x.js', options)

      expect(createTransformer).toHaveBeenCalledExactlyOnceWith({
        tsconfig: 'a',
      })
      expect(process.mock.calls[0]![2]).toMatchObject({
        transformerConfig: { tsconfig: 'a' },
      })
    })
  })

  describe('records', () => {
    it('writes served and mismatched from the keys only, under the token of the call', async () => {
      let { factory, written, channel } = createFactory(createReal(METHODS))
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan,
      })
      wrapped.getCacheKey('a + b', '/src/a.js', options)
      channel.token = 4
      await wrapped.getCacheKeyAsync!('other', '/src/a.js', options)
      channel.token = 5
      wrapped.getCacheKey('c', '/src/c.js', options)
      wrapped.process!('a + b', '/src/a.js', options)
      await wrapped.processAsync!('other', '/src/a.js', options)

      expect(written).toStrictEqual([
        [3, { file: '/src/a.js', kind: 'served' }],
        [4, { kind: 'mismatched', file: '/src/a.js' }],
      ])
    })

    it('writes them from a key of its own too', async () => {
      let { factory, written } = createFactory({ process: vi.fn() })
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan,
      })
      wrapped.getCacheKey('a + b', '/src/a.js', options)
      wrapped.getCacheKey('other', '/src/a.js', options)

      expect(written).toStrictEqual([
        [3, { file: '/src/a.js', kind: 'served' }],
        [3, { kind: 'mismatched', file: '/src/a.js' }],
      ])
    })
  })

  describe('the count of calls', () => {
    it.each(METHODS)(
      'marks a call of %s until it ends, and not after: a synchronous one by the count, an asynchronous one by the store',
      async name => {
        let seen: ReturnType<typeof readMarks>[] = []
        let real = {
          [name]:
            name.endsWith('Async') ?
              async () => {
                seen.push(readMarks(calls))
                await Promise.resolve()
                seen.push(readMarks(calls))
                return 'done'
              }
            : () => {
                seen.push(readMarks(calls))
                return 'done'
              },
        }
        let { factory, calls } = createFactory({ process: vi.fn(), ...real })
        let wrapped = await factory.createTransformer({
          real: '/real.js',
          plan,
        })
        let result: unknown = await wrapped[name]!('x', '/x.js', options)

        expect(result).toBe('done')
        expect(seen).toStrictEqual(
          name.endsWith('Async') ?
            [
              [0, true],
              [0, true],
            ]
          : [[1, undefined]],
        )
        expect(readMarks(calls)).toStrictEqual([0, undefined])
      },
    )

    it('leaves unmarked what runs outside an asynchronous call while it waits, as Jest loads the other imports of an ES module then', async () => {
      let release!: () => void
      let waiting = new Promise<void>(resolve => {
        release = resolve
      })
      let real = {
        processAsync: async () => {
          await waiting
          return { code: '' }
        },
      }
      let { factory, calls } = createFactory({ process: vi.fn(), ...real })
      let wrapped = await factory.createTransformer({ real: '/real.js', plan })
      let call = wrapped.processAsync!('x', '/x.js', options)
      let meanwhile = readMarks(calls)
      release()
      await call

      expect(meanwhile).toStrictEqual([0, undefined])
    })

    it.each<[string, () => Promise<{ code: string }>]>([
      ['settles', () => Promise.resolve({ code: '' })],
      ['rejects', () => Promise.reject(new Error('broke'))],
    ])(
      'counts an asynchronous call as unsettled until it %s, so a unit that leaves one can end its worker',
      async (_name, settle) => {
        let release!: () => void
        let waiting = new Promise<void>(resolve => {
          release = resolve
        })
        let real = {
          processAsync: async () => {
            await waiting
            return settle()
          },
        }
        let { factory, calls } = createFactory({ process: vi.fn(), ...real })
        let wrapped = await factory.createTransformer({
          real: '/real.js',
          plan,
        })
        let call = wrapped.processAsync!('x', '/x.js', options)
        let meanwhile = calls.unsettled
        release()
        await catchFailure(() => call)

        expect([meanwhile, calls.unsettled]).toStrictEqual([1, 0])
      },
    )

    it('counts the load of the module of a real transformer and the call of its factory', async () => {
      let seen: number[] = []
      let module = {
        createTransformer: async () => {
          seen.push(calls.transformer)
          await Promise.resolve()
          seen.push(calls.transformer)
          return { process: vi.fn() }
        },
      }
      let { factory, calls, load } = createFactory(module)
      load.mockImplementation(() => {
        seen.push(calls.transformer)
        return Promise.resolve(module)
      })
      await factory.createTransformer({ real: '/real.js', plan })

      expect(seen).toStrictEqual([1, 1, 1])
      expect(calls.transformer).toBe(0)
    })
  })

  describe('a failure of the real transformer', () => {
    it.each(METHODS)(
      'writes rejected on a switched text and rethrows the same error: %s',
      async name => {
        let error = new Error('cannot parse\nmore')
        let real = createReal([name])
        real[name]!.mockImplementation(() => {
          throw error
        })
        let { factory, written, calls } = createFactory({
          process: vi.fn(),
          ...real,
        })
        let wrapped = await factory.createTransformer({
          real: '/real.js',
          plan,
        })

        await expect(
          catchFailure(() => wrapped[name]!('a + b', '/src/a.js', options)),
        ).resolves.toBe(error)
        expect(written.at(-1)).toStrictEqual([
          3,
          { message: 'cannot parse', file: '/src/a.js', kind: 'rejected' },
        ])
        expect(calls.transformer).toBe(0)
      },
    )

    it.each(METHODS)(
      'only rethrows on a text that was not switched: %s',
      async name => {
        let error = new Error('the project is broken')
        let real = createReal([name])
        real[name]!.mockImplementation(() => {
          throw error
        })
        let { factory, written } = createFactory({
          process: vi.fn(),
          ...real,
        })
        let wrapped = await factory.createTransformer({
          real: '/real.js',
          plan,
        })

        await expect(
          catchFailure(() => wrapped[name]!('other', '/src/a.js', options)),
        ).resolves.toBe(error)
        await expect(
          catchFailure(() => wrapped[name]!('c', '/src/c.js', options)),
        ).resolves.toBe(error)
        expect(written.map(([, record]) => record.kind)).not.toContain(
          'rejected',
        )
      },
    )

    it.each(['getCacheKeyAsync', 'processAsync'] as const)(
      'treats a rejection as a throw: %s',
      async name => {
        let error = new Error('later')
        let real = createReal([name])
        real[name]!.mockRejectedValue(error)
        let { factory, written, calls } = createFactory({
          process: vi.fn(),
          ...real,
        })
        let wrapped = await factory.createTransformer({
          real: '/real.js',
          plan,
        })

        await expect(
          wrapped[name]!('a + b', '/src/a.js', options),
        ).rejects.toBe(error)
        expect(written.at(-1)).toStrictEqual([
          3,
          { file: '/src/a.js', kind: 'rejected', message: 'later' },
        ])
        expect(calls.transformer).toBe(0)
      },
    )
  })

  describe('a key of its own', () => {
    /**
     * Makes a key with the wrapper of a transformer that has none.
     *
     * @param source - Text from Jest.
     * @param file - Path of the module.
     * @param instrument - Whether Jest asks for coverage counters.
     * @returns The hash the wrapper makes.
     */
    async function getKey(
      source: string,
      file: string,
      instrument: boolean,
    ): Promise<string> {
      let { factory } = createFactory({ process: vi.fn() })
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan: null,
      })
      return wrapped.getCacheKey(source, file, { ...options, instrument })
    }

    it('is the hash of the text, the plain config, the instrument flag and the file', async () => {
      let expected = createHash('sha1')
        .update('x')
        .update('{"plain":true}')
        .update('instrument')
        .update('/x.js')
        .digest('hex')

      await expect(getKey('x', '/x.js', true)).resolves.toBe(expected)
    })

    it('differs by text, by instrument flag and by file', async () => {
      let base = await getKey('x', '/x.js', false)

      await expect(getKey('y', '/x.js', false)).resolves.not.toBe(base)
      await expect(getKey('x', '/x.js', true)).resolves.not.toBe(base)
      await expect(getKey('x', '/y.js', false)).resolves.not.toBe(base)
      await expect(getKey('x', '/x.js', false)).resolves.toBe(base)
    })

    it('differs by the config of the project', async () => {
      let base = await getKey('x', '/x.js', false)
      let { channel } = createChannel()
      let factory = createTransformerFactory({
        calls: {
          asyncTransformer: new AsyncLocalStorage<true>(),
          asyncResolver: new AsyncLocalStorage<true>(),
          environment: new AsyncLocalStorage<true>(),
          defaultResolver: 0,
          transformer: 0,
          unsettled: 0,
          resolver: 0,
        },
        projects: new Map([
          ['p', { ...project, configString: '{"plain":false}' }],
        ]),
        requireOrImportModule: () => Promise.resolve({ process: vi.fn() }),
        stripTypes: null,
        channel,
      })
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan: null,
      })

      expect(wrapped.getCacheKey('x', '/x.js', options)).not.toBe(base)
    })

    it('hashes the switched text', async () => {
      let { factory } = createFactory({ process: vi.fn() })
      let wrapped = await factory.createTransformer({
        real: '/real.js',
        plan,
      })

      expect(wrapped.getCacheKey('a + b', '/src/a.js', options)).toBe(
        createHash('sha1')
          .update('a - b')
          .update('{"plain":true}')
          .update('')
          .update('/src/a.js')
          .digest('hex'),
      )
    })
  })

  it('works unbound, and calls the real one as a method', async () => {
    /**
     * Real transformer whose methods read its fields.
     */
    class Real {
      /**
       * What every result starts with.
       */
      public prefix = 'real'

      /**
       * Gives a key without blocking.
       *
       * @param text - Text of the module.
       * @returns The prefix and the text.
       */
      public getCacheKeyAsync(text: string): Promise<string> {
        return Promise.resolve(`${this.prefix}:${text}`)
      }

      /**
       * Transforms a text without blocking.
       *
       * @param text - Text of the module.
       * @returns The prefix and the text.
       */
      public processAsync(text: string): Promise<string> {
        return Promise.resolve(`${this.prefix}:${text}`)
      }

      /**
       * Gives a key.
       *
       * @param text - Text of the module.
       * @returns The prefix and the text.
       */
      public getCacheKey(text: string): string {
        return `${this.prefix}:${text}`
      }

      /**
       * Transforms a text.
       *
       * @param text - Text of the module.
       * @returns The prefix and the text.
       */
      public process(text: string): string {
        return `${this.prefix}:${text}`
      }
    }

    let { factory } = createFactory(new Real())
    let wrapped = await factory.createTransformer({
      real: '/real.js',
      plan,
    })
    let { getCacheKeyAsync, processAsync, getCacheKey, process } = wrapped
    let parameters = ['a + b', '/src/a.js', options] as const

    expect(getCacheKey(...parameters)).toBe('real:a - b')
    expect(process!(...parameters)).toBe('real:a - b')
    await expect(getCacheKeyAsync!(...parameters)).resolves.toBe('real:a - b')
    await expect(processAsync!(...parameters)).resolves.toBe('real:a - b')
  })

  it('works unbound with a key of its own and for the identity entry', async () => {
    let { factory } = createFactory(null)
    let { getCacheKey, process } = await factory.createTransformer({
      real: null,
      plan,
    })

    expect(getCacheKey('a + b', '/src/a.js', options)).toHaveLength(40)
    expect(process!('a + b', '/src/a.js', options)).toStrictEqual({
      code: 'a - b',
    })
  })

  it('reads a plan once and an entry on first use, for the life of the worker', async () => {
    let second = writeSwitchPlan(path.join(directory, 'second'), [
      { switched: 'c - d', original: 'c + d', file: '/src/c.js' },
      { switched: 'e - f', original: 'e + f', file: '/src/e.js' },
    ])
    let { factory } = createFactory(null)
    let first = await factory.createTransformer({ plan: second, real: null })

    expect(first.process!('c + d', '/src/c.js', options)).toStrictEqual({
      code: 'c - d',
    })

    await rm(path.join(directory, 'second'), { recursive: true })
    let again = await factory.createTransformer({ plan: second, real: null })

    expect(again.process!('c + d', '/src/c.js', options)).toStrictEqual({
      code: 'c - d',
    })
    expect(again.process!('x', '/src/x.js', options)).toStrictEqual({
      code: 'x',
    })
    expect(() => again.process!('e + f', '/src/e.js', options)).toThrow(
      /ENOENT/u,
    )
  })

  it('keeps the entries of each plan apart', async () => {
    let second = writeSwitchPlan(path.join(directory, 'second'), [
      { switched: 'a * b', original: 'a + b', file: '/src/a.js' },
    ])
    let { factory } = createFactory(null)
    let first = await factory.createTransformer({ real: null, plan })
    let other = await factory.createTransformer({ plan: second, real: null })

    expect(first.process!('a + b', '/src/a.js', options)).toStrictEqual({
      code: 'a - b',
    })
    expect(other.process!('a + b', '/src/a.js', options)).toStrictEqual({
      code: 'a * b',
    })
  })

  it('reads and hashes with the functions of load time, whatever a test spies on later', async () => {
    let { factory } = createFactory({ process: vi.fn() })
    let wrapped = await factory.createTransformer({ real: '/real.js', plan })
    let readFileSync = vi.spyOn(fs, 'readFileSync')
    let createHashSpy = vi.spyOn(crypto, 'createHash')
    syncBuiltinESMExports()
    wrapped.getCacheKey('a + b', '/src/a.js', options)

    expect(readFileSync).not.toHaveBeenCalled()
    expect(createHashSpy).not.toHaveBeenCalled()
  })
})
