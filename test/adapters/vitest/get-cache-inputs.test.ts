import { describe, expect, it } from 'vitest'
import { inspect } from 'node:util'
import path from 'node:path'

import { getCacheInputs } from '../../../adapters/vitest/get-cache-inputs'
import { createDigest } from '../../../core/cache/create-digest'

/**
 * Builds a Vitest project as `getCacheInputs` reads it.
 *
 * @param fields - Settings that differ from the defaults.
 * @param fields.envDir - Directory of the `.env` files, or false.
 * @param fields.environment - Name or path of the test environment.
 * @param fields.shuffle - Whether Vitest shuffles the order of tests.
 * @param fields.name - Project name, empty for the root project.
 * @param fields.evaluated - Module ids the main process evaluated for the
 *   global setup files, or undefined without a module runner.
 * @param fields.define - Values Vite's `define` replaces, or undefined.
 * @param fields.defines - Defines Vitest sets as globals; `__D__` when omitted.
 * @param fields.scripted - Defines Vitest runs as a script; `a.b` with
 *   `define`, none without it, when omitted.
 * @param fields.provided - Values provided to the workers, mootant's options
 *   among them; mootant's options, a map and a big integer when omitted.
 * @param fields.filter - `onUnhandledError` of the root configuration, or
 *   undefined.
 * @returns Project with settings and Vite configuration.
 */
function createProject(fields: {
  scripted?: Record<string, unknown>
  provided?: Record<string, unknown>
  defines?: Record<string, unknown>
  define?: Record<string, unknown>
  envDir?: string | false
  evaluated?: string[]
  environment?: string
  filter?(): boolean
  shuffle?: boolean
  name?: string
}): unknown {
  return {
    config: {
      sequence: {
        shuffle: fields.shuffle ?? false,
        concurrent: false,
        hooks: 'stack',
        seed: 123,
      },
      _scriptDefines:
        fields.scripted ?? (fields.define ? { 'a.b': 'x' } : undefined),
      snapshotOptions: { updateSnapshot: 'new' },
      environment: fields.environment ?? 'node',
      defines: fields.defines ?? { __D__: 2 },
      globalSetup: ['/p/setup.ts'],
      environmentOptions: {},
      hookTimeout: 10_000,
      maxConcurrency: 5,
      testTimeout: 5000,
      env: { A: '1' },
      pool: 'forks',
      isolate: true,
      root: '/p',
      retry: 0,
    },
    runner:
      fields.evaluated === undefined ?
        {}
      : {
          evaluatedModules: {
            idToModuleMap: new Map(fields.evaluated.map(id => [id, {}])),
          },
        },
    vite: {
      config: {
        configFileDependencies: ['/p/vitest.workspace.ts'],
        envDir: fields.envDir ?? '/p',
        define: fields.define,
        mode: 'test',
      },
    },
    getProvidedContext: () =>
      fields.provided ?? {
        mootant: { directory: '/t' },
        seed: new Map([['n', 1]]),
        big: 1n,
      },
    globalConfig: { dangerouslyIgnoreUnhandledErrors: true },
    vitest: { state: { onUnhandledError: fields.filter } },
    name: fields.name ?? '',
  }
}

/**
 * Lists the cache inputs of a session of the given projects, with no
 * environment variables.
 *
 * @param projects - Projects of the session (`createProject`).
 * @returns Cache inputs.
 */
function listInputs(projects: unknown[]): ReturnType<typeof getCacheInputs> {
  return getCacheInputs(
    { vite: { config: { configFileDependencies: [] } }, projects } as never,
    {},
  )
}

/**
 * Hashes one provided value as `getCacheInputs` does.
 *
 * @param value - Value a global setup file provided.
 * @returns Hash of the value under `provide=value`.
 */
function hashProvided(value: unknown): undefined | string {
  return listInputs([createProject({ provided: { value } })]).environment?.[
    ''
  ]?.['provide=value']
}

/**
 * `onUnhandledError` of a root configuration that drops every unhandled error.
 *
 * @returns False.
 */
function dropErrors(): boolean {
  return false
}

describe('getCacheInputs', () => {
  it('lists the files and settings of every project', () => {
    let inputs = getCacheInputs(
      {
        projects: [
          createProject({
            evaluated: [
              '/p/setup.ts',
              '/p/seed.ts?v=1',
              '/p/node_modules/x/index.js',
              'node:fs',
            ],
            environment: './env/custom.ts',
            define: { __N__: '1' },
            filter: dropErrors,
            shuffle: true,
          }),
          createProject({ environment: 'jsdom', envDir: false, name: 'web' }),
        ],
        vite: { config: { configFileDependencies: ['/p/vitest.config.ts'] } },
      } as never,
      {
        '': {
          VITEST_WORKER_ID: 'v',
          VITEST_POOL_ID: 'q',
          LC_TIME: 'l2',
          NODE_ENV: 'n',
          LANG: 'l1',
          SHLVL: 's',
          PATH: 'p',
          PWD: 'w',
          TZ: 't',
        },
      },
    )
    let values = {
      'provide=*': createDigest(
        "[ [ 'seed', Map(1) { 'n' => 1 } ], [ 'big', 1n ] ]",
      ),
      'provide=seed': createDigest("Map(1) { 'n' => 1 }"),
      'define=__D__': createDigest('[ [ 2 ], [] ]'),
      'provide=big': createDigest('1n'),
    }

    expect(inputs.files).toStrictEqual([
      '/p/vitest.config.ts',
      '/p/vitest.workspace.ts',
      path.join('/p', '.env'),
      path.join('/p', '.env.local'),
      path.join('/p', '.env.test'),
      path.join('/p', '.env.test.local'),
      '/p/setup.ts',
      '/p/seed.ts',
      '/p/node_modules/x/index.js',
      path.resolve('/p', './env/custom.ts'),
    ])
    expect(inputs.settings).toStrictEqual([
      {
        variables: [
          ['LANG', 'l1'],
          ['LC_TIME', 'l2'],
          ['NODE_ENV', 'n'],
          ['TZ', 't'],
        ],
        sequence: {
          concurrent: false,
          hooks: 'stack',
          shuffle: true,
          seed: 123,
        },
        dangerouslyIgnoreUnhandledErrors: true,
        onUnhandledError: String(dropErrors),
        environment: './env/custom.ts',
        environmentOptions: {},
        hookTimeout: 10_000,
        maxConcurrency: 5,
        testTimeout: 5000,
        env: { A: '1' },
        isolate: true,
        update: 'new',
        pool: 'forks',
        retry: 0,
        name: '',
      },
      expect.objectContaining({
        sequence: {
          concurrent: false,
          hooks: 'stack',
          shuffle: false,
          seed: null,
        },
        onUnhandledError: null,
        environment: 'jsdom',
        variables: [],
        name: 'web',
      }),
    ])
    expect(inputs.environment).toStrictEqual({
      '': {
        '*': createDigest([
          ['LANG', 'l1'],
          ['LC_TIME', 'l2'],
          ['NODE_ENV', 'n'],
          ['PATH', 'p'],
          ['TZ', 't'],
        ]),
        VITEST_WORKER_ID: 'v',
        VITEST_POOL_ID: 'q',
        LC_TIME: 'l2',
        NODE_ENV: 'n',
        LANG: 'l1',
        SHLVL: 's',
        PATH: 'p',
        PWD: 'w',
        TZ: 't',
        ...values,
        'defines=': createDigest("[ [ '__D__' ], [ 'a.b' ], { __N__: '1' } ]"),
        'define=a.b': createDigest("[ [], [ 'x' ] ]"),
      },
      web: {
        ...values,
        'defines=': createDigest("[ [ '__D__' ], [], null ]"),
        '*': createDigest([]),
      },
    })
    expect(Object.keys(inputs.environment?.[''] ?? {})).toStrictEqual([
      'LANG',
      'LC_TIME',
      'NODE_ENV',
      'PATH',
      'PWD',
      'SHLVL',
      'TZ',
      'VITEST_POOL_ID',
      'VITEST_WORKER_ID',
      '*',
      'provide=seed',
      'provide=big',
      'provide=*',
      'define=__D__',
      'define=a.b',
      'defines=',
    ])
  })

  it('hashes the provided values and defines of each project apart, never the options of mootant', () => {
    let base = listInputs([
      createProject({ provided: { apiUrl: 'a', mootant: 1 }, name: 'a' }),
      createProject({ provided: { mootant: 1 }, name: 'b' }),
    ])
    let url = listInputs([
      createProject({ provided: { apiUrl: 'b', mootant: 1 }, name: 'a' }),
      createProject({ provided: { mootant: 1 }, name: 'b' }),
    ])
    let options = listInputs([
      createProject({ provided: { apiUrl: 'a', mootant: 2 }, name: 'a' }),
      createProject({ provided: { mootant: 2 }, name: 'b' }),
    ])
    let define = listInputs([
      createProject({
        provided: { apiUrl: 'a', mootant: 1 },
        defines: { __D__: 3 },
        name: 'a',
      }),
      createProject({ provided: { mootant: 1 }, name: 'b' }),
    ])
    let added = listInputs([
      createProject({
        provided: { apiUrl: 'a', mootant: 1 },
        defines: { __D__: 2, __E__: 1 },
        name: 'a',
      }),
      createProject({ provided: { mootant: 1 }, name: 'b' }),
    ])
    let a = base.environment?.['a']

    expect(a).toStrictEqual({
      'defines=': createDigest("[ [ '__D__' ], [], null ]"),
      'provide=*': createDigest("[ [ 'apiUrl', 'a' ] ]"),
      'define=__D__': createDigest('[ [ 2 ], [] ]'),
      'provide=apiUrl': createDigest("'a'"),
      '*': createDigest([]),
    })
    expect(url.settings).toStrictEqual(base.settings)
    expect(url.environment?.['b']).toStrictEqual(base.environment?.['b'])
    expect(url.environment?.['a']).toStrictEqual({
      ...a,
      'provide=*': createDigest("[ [ 'apiUrl', 'b' ] ]"),
      'provide=apiUrl': createDigest("'b'"),
    })
    expect(options.environment).toStrictEqual(base.environment)
    expect(define.environment?.['a']).toStrictEqual({
      ...a,
      'define=__D__': createDigest('[ [ 3 ], [] ]'),
    })
    expect(added.environment?.['a']).toStrictEqual({
      ...a,
      'defines=': createDigest("[ [ '__D__', '__E__' ], [], null ]"),
      'define=__E__': createDigest('[ [ 1 ], [] ]'),
    })
    expect(
      listInputs([createProject({ provided: { '*': 1, x: 2 } })]).environment?.[
        ''
      ]?.['provide=*'],
    ).toBe(createDigest("[ [ '*', 1 ], [ 'x', 2 ] ]"))
  })

  it('hashes a define by both values a project gives it, when its script and its globals hold the same key', () => {
    /**
     * Hashes `__F__` of a project that gives it as a global and in a script.
     *
     * @param value - Value of the global.
     * @param code - Code of the script.
     * @returns Hash under `define=__F__`.
     */
    function hashBoth(value: number, code: string): undefined | string {
      return listInputs([
        createProject({ scripted: { __F__: code }, defines: { __F__: value } }),
      ]).environment?.['']?.['define=__F__']
    }

    expect(hashBoth(1, 'globalThis.f')).toBe(
      createDigest("[ [ 1 ], [ 'globalThis.f' ] ]"),
    )
    expect(hashBoth(2, 'globalThis.f')).not.toBe(hashBoth(1, 'globalThis.f'))
    expect(hashBoth(1, 'globalThis.g')).not.toBe(hashBoth(1, 'globalThis.f'))
  })

  it('hashes a provided value by every part a worker gets, getters, objects that describe themselves and long buffers included', () => {
    let changed = Buffer.alloc(60)
    changed[59] = 1

    expect(
      hashProvided({
        get port() {
          return 1
        },
      }),
    ).not.toBe(
      hashProvided({
        get port() {
          return 2
        },
      }),
    )
    expect(hashProvided({ [inspect.custom]: () => 'box', value: 1 })).not.toBe(
      hashProvided({ [inspect.custom]: () => 'box', value: 2 }),
    )
    expect(hashProvided(Buffer.alloc(60))).not.toBe(hashProvided(changed))
  })
})
