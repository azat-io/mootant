import { describe, expect, it } from 'vitest'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'

import { listJestConfigPaths } from '../../../adapters/jest/list-jest-config-paths'

/**
 * Creates a project configuration whose paths are all in `node_modules`.
 *
 * @param config - What differs from the default.
 * @returns A kept project.
 */
function createProject(config: Partial<JestProjectConfig>): {
  config: JestProjectConfig
  name: string
} {
  return {
    config: {
      testEnvironment: '/p/node_modules/jest-environment-node/index.js',
      runner: '/p/node_modules/jest-runner/build/index.js',
      testRunner: '/p/node_modules/jest-circus/runner.js',
      moduleFileExtensions: ['js'],
      transformIgnorePatterns: [],
      snapshotSerializers: [],
      setupFilesAfterEnv: [],
      setupFiles: [],
      rootDir: '/p',
      roots: ['/p'],
      transform: [],
      id: 'id',
      ...config,
    },
    name: '',
  }
}

/**
 * Global configuration whose test sequencer is in `node_modules`.
 */
let globalConfig = {
  testSequencer: '/p/node_modules/@jest/test-sequencer/index.js',
  detectOpenHandles: false,
  maxWorkers: 1,
}

describe('listJestConfigPaths', () => {
  it('lists nothing when every file is in node_modules', () => {
    expect(
      listJestConfigPaths({
        projects: [
          createProject({
            transform: [['x', '/p/node_modules/babel-jest/index.js', {}]],
            globalSetup: String.raw`C:\p\node_modules\setup\index.js`,
          }),
        ],
        globalConfig,
      }),
    ).toStrictEqual([])
  })

  it.each([[null], ['']])('takes %j for no file', value => {
    expect(
      listJestConfigPaths({
        projects: [
          createProject({
            dependencyExtractor: value,
            snapshotResolver: value,
            globalTeardown: value,
            globalSetup: value,
            resolver: value,
            runtime: value,
          }),
        ],
        globalConfig: {
          ...globalConfig,
          globalTeardown: value,
          globalSetup: value,
        },
      }),
    ).toStrictEqual([])
  })

  it('lists the global setup and teardown of a configuration with projects, which only the global configuration holds', () => {
    expect(
      listJestConfigPaths({
        projects: [
          createProject({ globalTeardown: null, globalSetup: null }),
          createProject({ globalTeardown: null, globalSetup: null }),
        ],
        globalConfig: {
          ...globalConfig,
          globalTeardown: '/p/teardown.mjs',
          globalSetup: '/p/setup.mjs',
        },
      }),
    ).toStrictEqual(['/p/setup.mjs', '/p/teardown.mjs'])
  })

  it('lists every file the configuration names, sorted, each once', () => {
    expect(
      listJestConfigPaths({
        projects: [
          createProject({
            transform: [
              ['x', '/p/transform.js', {}],
              ['y', '/p/node_modules/babel-jest/index.js', {}],
            ],
            setupFilesAfterEnv: ['/p/setup-after.js'],
            snapshotSerializers: ['/p/serializer.js'],
            dependencyExtractor: '/p/extractor.js',
            testEnvironment: '/p/environment.js',
            snapshotResolver: '/p/snapshots.js',
            globalTeardown: '/p/teardown.js',
            testRunner: '/p/framework.js',
            setupFiles: ['/p/setup.js'],
            globalSetup: '/p/global.js',
            resolver: '/p/resolver.js',
            runtime: '/p/runtime.js',
          }),
          createProject({ setupFiles: ['/p/setup.js', '/p/other.js'] }),
        ],
        globalConfig: { ...globalConfig, testSequencer: '/p/sequencer.js' },
      }),
    ).toStrictEqual(
      [
        'environment',
        'extractor',
        'framework',
        'global',
        'other',
        'resolver',
        'runtime',
        'sequencer',
        'serializer',
        'setup-after',
        'setup',
        'snapshots',
        'teardown',
        'transform',
      ].map(name => `/p/${name}.js`),
    )
  })
})
