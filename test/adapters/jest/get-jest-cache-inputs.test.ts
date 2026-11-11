import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'

import { getJestCacheInputs } from '../../../adapters/jest/get-jest-cache-inputs'
import { hashEnvironment } from '../../../adapters/shared/hash-environment'
import { compareCodeUnits } from '../../../core/compare-code-units'

/* Cspell:words swcrc */

/**
 * Root of the temporary project of the current test.
 */
let root = ''

/**
 * Gives what the cache inputs are built from, for a session of one project.
 *
 * @param fields - Fields that differ.
 * @returns The input of `getJestCacheInputs`.
 */
function createInput(
  fields: Partial<Parameters<typeof getJestCacheInputs>[0]> = {},
): Parameters<typeof getJestCacheInputs>[0] {
  return {
    ready: {
      env: {
        NODE_OPTIONS: `--require ${root}/hook.js`,
        BABEL_ENV: 'test',
        NODE_ENV: 'test',
        HOME: '/home/a',
        TZ: 'UTC',
      },
      globalConfig: {
        detectOpenHandles: false,
        testSequencer: '/s.js',
        maxWorkers: 3,
      },
      moduleMaps: {},
      type: 'ready',
      umask: 0o022,
      configs: {},
      loaded: [],
      tests: [],
      cwd: root,
    },
    globalConfig: {
      testSequencer: path.join(root, 'node_modules/sequencer.js'),
      coverageDirectory: '/elsewhere/cov',
      detectOpenHandles: false,
      testNamePattern: 'adds',
      maxConcurrency: 5,
      testTimeout: 5000,
      useStderr: false,
      watchman: true,
      maxWorkers: 3,
      seed: 1,
    } as Parameters<typeof getJestCacheInputs>[0]['globalConfig'],
    packages: {
      transformVersion: '30.5.2',
      stripsTypes: true,
      version: '30.4.2',
      hasteMap: '/h',
      console: '/c',
      resolve: '/r',
      runtime: '/t',
      runner: '/u',
      util: '/l',
      bin: '/b',
    },
    command: {
      nodeFlags: ['--stack-size=500'],
      env: { ROOT_DIR: root },
      diagnostics: [],
      args: [],
    },
    projects: [{ config: createConfig(), name: '' }],
    consoles: new Map([['', 'buffer']]),
    options: { env: { EXTRA: '1' } },
    transforms: new Set(),
    directory: '/w/jest',
    args: [],
    root,
    ...fields,
  }
}

/**
 * Builds a project configuration as `--showConfig` prints it, with settings the
 * cache leaves out and settings it keeps.
 *
 * @param fields - Fields that differ.
 * @returns The configuration.
 */
function createConfig(
  fields: Partial<JestProjectConfig> = {},
): JestProjectConfig {
  return {
    testEnvironment: path.join(root, 'node_modules/jest-environment-node.js'),
    runner: path.join(root, 'node_modules/jest-runner/build/index.js'),
    testRunner: path.join(root, 'node_modules/jest-circus/runner.js'),
    coveragePathIgnorePatterns: ['/node_modules/'],
    setupFiles: [path.join(root, 'test/setup.js')],
    cacheDirectory: '/elsewhere/cache/a',
    coverageDirectory: '/elsewhere/cov',
    watchPathIgnorePatterns: ['/w/'],
    moduleFileExtensions: ['js'],
    reporters: [['default', {}]],
    notifyMode: 'failure-change',
    transformIgnorePatterns: [],
    collectCoverageFrom: ['x'],
    snapshotSerializers: [],
    setupFilesAfterEnv: [],
    collectCoverage: true,
    watchman: true,
    roots: [root],
    rootDir: root,
    maxWorkers: 2,
    notify: false,
    transform: [],
    id: 'hash-a',
    ...fields,
  } as JestProjectConfig
}

describe('getJestCacheInputs', () => {
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-cache-')))
    await writeFile(path.join(root, 'tsconfig.json'), '{}')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('keeps the settings that change verdicts, with the root in their strings replaced', () => {
    let hashes = hashEnvironment(createInput().ready.env)

    expect(getJestCacheInputs(createInput()).settings).toStrictEqual({
      projects: [
        {
          config: {
            testEnvironment: '<root>/node_modules/jest-environment-node.js',
            runner: '<root>/node_modules/jest-runner/build/index.js',
            testRunner: '<root>/node_modules/jest-circus/runner.js',
            setupFiles: ['<root>/test/setup.js'],
            moduleFileExtensions: ['js'],
            transformIgnorePatterns: [],
            snapshotSerializers: [],
            setupFilesAfterEnv: [],
            rootDir: '<root>',
            roots: ['<root>'],
            transform: [],
          },
          console: 'buffer',
          name: '',
        },
      ],
      global: {
        testNamePattern: 'adds',
        randomize: undefined,
        maxConcurrency: 5,
        testTimeout: 5000,
        useStderr: false,
        seed: 1,
      },
      variables: [
        ['BABEL_ENV', hashes['BABEL_ENV']],
        ['NODE_ENV', hashes['NODE_ENV']],
        ['TZ', hashes['TZ']],
      ],
      env: { ROOT_DIR: '<root>', EXTRA: '1' },
      nodeOptions: '--require <root>/hook.js',
      nodeFlags: ['--stack-size=500'],
      node: process.version,
      transform: '30.5.2',
      freshWorkers: false,
      jest: '30.4.2',
    })
  })

  it('keeps the console of each project and whether every unit gets a new worker', () => {
    let settings = getJestCacheInputs(
      createInput({
        projects: [
          { config: createConfig({ displayName: { name: 'a' } }), name: 'a' },
          { config: createConfig({ id: 'hash-b' }), name: 'b' },
        ],
        consoles: new Map([
          ['a', 'stream'],
          ['b', 'none'],
        ]),
        options: { freshWorkers: true },
      }),
    ).settings as {
      projects: { console: string; name: string }[]
      freshWorkers: boolean
    }

    expect(
      settings.projects.map(project => [project.name, project.console]),
    ).toStrictEqual([
      ['a', 'stream'],
      ['b', 'none'],
    ])
    expect(settings.freshWorkers).toBe(true)
  })

  it('keeps no Node options when the host has none', () => {
    let settings = getJestCacheInputs(
      createInput({ ready: { ...createInput().ready, env: {} } }),
    ).settings as { nodeOptions: string | null }

    expect(settings.nodeOptions).toBeNull()
  })

  it('takes the root out of strings at any depth, and leaves other strings as they are', () => {
    let settings = getJestCacheInputs(
      createInput({
        projects: [
          {
            config: createConfig({
              globals: { deep: { list: [`${root}/a`, '/other/b', 3, null] } },
              moduleNameMapper: [['^@/(.*)$', `${root}/src/$1`]],
            } as Partial<JestProjectConfig>),
            name: '',
          },
        ],
      }),
    ).settings as { projects: { config: Record<string, unknown> }[] }

    expect(settings.projects[0]!.config).toMatchObject({
      globals: { deep: { list: ['<root>/a', '/other/b', 3, null] } },
      moduleNameMapper: [['^@/(.*)$', '<root>/src/$1']],
    })
  })

  it('takes what the transformers read that exists or configures them, and leaves out the missing files they probed, which depend on what their cache held', async () => {
    await writeFile(path.join(root, 'shared.json'), '{}')
    let { files } = getJestCacheInputs(
      createInput({
        transforms: new Set([
          path.join(root, 'config/tsconfig.base.json'),
          path.join(root, 'src/package.json'),
          path.join(root, 'src/sub/.babelrc'),
          path.join(root, 'shared.json'),
          path.join(root, 'src.d.ts'),
          path.join(root, 'src.ts'),
        ]),
      }),
    )

    expect(files).toStrictEqual(
      expect.arrayContaining([
        path.join(root, 'config/tsconfig.base.json'),
        path.join(root, 'src/sub/.babelrc'),
        path.join(root, 'shared.json'),
      ]) as string[],
    )
    expect(
      files.filter(file =>
        ['src/package.json', 'src.d.ts', 'src.ts']
          .map(name => path.join(root, name))
          .includes(file),
      ),
    ).toStrictEqual([])
  })

  it('lists the root package.json, the paths of the configuration, the configuration files, what the transformers read and what the host loaded outside node_modules and mootant files, sorted, each once', () => {
    let loaded = [
      path.join(root, 'jest.config.js'),
      path.join(root, 'jest/base.js'),
      path.join(root, 'node_modules/babel-jest/build/index.js'),
      '/w/jest/runner.host',
    ]
    let { files } = getJestCacheInputs(
      createInput({
        transforms: new Set([
          path.join(root, 'config/tsconfig.test.json'),
          path.join(root, 'src/.babelrc'),
        ]),
        ready: { ...createInput().ready, loaded },
        args: ['--config', 'jest/unit.js'],
      }),
    )

    expect(files).toStrictEqual([...new Set(files)].toSorted(compareCodeUnits))
    expect(files).toStrictEqual(
      expect.arrayContaining([
        path.join(root, 'config/tsconfig.test.json'),
        path.join(root, 'babel.config.js'),
        path.join(root, 'jest.config.js'),
        path.join(root, 'src/.babelrc'),
        path.join(root, 'jest/unit.js'),
        path.join(root, 'jest/base.js'),
        path.join(root, 'package.json'),
        path.join(root, 'test/setup.js'),
        path.join(root, 'tsconfig.json'),
        path.join(root, '.swcrc'),
      ]) as string[],
    )
    expect(files.filter(file => file.includes('node_modules'))).toStrictEqual(
      [],
    )
    expect(files).not.toContain('/w/jest/runner.host')
  })

  it('lists the configuration files of the directory of every project', () => {
    let packageRoot = path.join(root, 'packages/a')
    let { files } = getJestCacheInputs(
      createInput({
        projects: [
          { config: createConfig(), name: '' },
          {
            config: createConfig({
              roots: [packageRoot],
              rootDir: packageRoot,
              id: 'hash-b',
            }),
            name: 'a',
          },
        ],
        consoles: new Map([
          ['a', 'buffer'],
          ['', 'buffer'],
        ]),
      }),
    )

    expect(files).toStrictEqual(
      expect.arrayContaining([
        path.join(packageRoot, 'babel.config.json'),
        path.join(packageRoot, 'tsconfig.json'),
        path.join(packageRoot, '.babelrc'),
      ]) as string[],
    )
  })

  it('gives every project the hashes of the variables of the host after global setup', () => {
    let hashes = hashEnvironment(createInput().ready.env)

    expect(
      getJestCacheInputs(
        createInput({
          projects: [
            { config: createConfig(), name: 'a' },
            { config: createConfig({ id: 'hash-b' }), name: 'b' },
          ],
        }),
      ).environment,
    ).toStrictEqual({ a: hashes, b: hashes })
  })
})
