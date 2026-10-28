import { describe, expect, it } from 'vitest'
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
 * @returns Project with settings and Vite configuration.
 */
function createProject(fields: {
  define?: Record<string, unknown>
  envDir?: string | false
  evaluated?: string[]
  environment?: string
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
      snapshotOptions: { updateSnapshot: 'new' },
      environment: fields.environment ?? 'node',
      globalSetup: ['/p/setup.ts'],
      ...(fields.define && { _scriptDefines: { 'a.b': 'x' } }),
      environmentOptions: {},
      defines: { __D__: 2 },
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
    getProvidedContext: () => ({
      mootant: { directory: '/t' },
      seed: new Map([['n', 1]]),
      big: 1n,
    }),
    name: fields.name ?? '',
  }
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

    expect(inputs.files).toStrictEqual([
      '/p/vitest.config.ts',
      '/p/vitest.workspace.ts',
      path.join('/p', '.env'),
      path.join('/p', '.env.local'),
      path.join('/p', '.env.test'),
      path.join('/p', '.env.test.local'),
      '/p/setup.ts',
      '/p/seed.ts',
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
        values:
          "[ { __N__: '1' }, { __D__: 2 }, { 'a.b': 'x' }, [ [ 'seed', Map(1) { 'n' => 1 } ], [ 'big', 1n ] ] ]",
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
        values:
          "[ null, { __D__: 2 }, null, [ [ 'seed', Map(1) { 'n' => 1 } ], [ 'big', 1n ] ] ]",
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
      },
      web: { '*': createDigest([]) },
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
    ])
  })
})
