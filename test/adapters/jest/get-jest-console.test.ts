import { describe, expect, it } from 'vitest'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'
import type { JestGlobalConfig } from '../../../adapters/jest/types/jest-global-config'

import { getJestConsole } from '../../../adapters/jest/get-jest-console'

/**
 * Global configuration that says nothing of the console.
 */
const GLOBAL: JestGlobalConfig = {
  detectOpenHandles: false,
  testSequencer: '/s',
  maxWorkers: 2,
}

/**
 * Project configuration that says nothing of the console.
 */
const PROJECT: JestProjectConfig = {
  runner: '/p/node_modules/jest-runner/build/index.js',
  testRunner: '/p/node_modules/jest-circus/runner.js',
  testEnvironment: '/p/environment.js',
  moduleFileExtensions: ['js'],
  transformIgnorePatterns: [],
  snapshotSerializers: [],
  setupFilesAfterEnv: [],
  setupFiles: [],
  rootDir: '/p',
  roots: ['/p'],
  transform: [],
  id: 'p',
}

describe('getJestConsole', () => {
  it.each<[string, Partial<JestGlobalConfig>, Partial<JestProjectConfig>]>([
    ['a silent run', { silent: true }, {}],
    ['a silent run that is verbose too', { verbose: true, silent: true }, {}],
    ['a silent project of Jest 30', {}, { silent: true }],
    [
      'a silent project in a verbose run',
      { verbose: true },
      { verbose: true, silent: true },
    ],
  ])('drops what tests print in %s', (_name, global, project) => {
    expect(
      getJestConsole({
        globalConfig: { ...GLOBAL, ...global },
        config: { ...PROJECT, ...project },
        tests: 2,
      }),
    ).toBe('none')
  })

  it.each<[string, Partial<JestGlobalConfig>, Partial<JestProjectConfig>]>([
    ['a verbose run', { verbose: true }, {}],
    ['a verbose project of Jest 30', {}, { verbose: true }],
    [
      'a project that says no to silent in a silent run',
      { silent: true },
      { verbose: true, silent: false },
    ],
  ])('writes at once in %s', (_name, global, project) => {
    expect(
      getJestConsole({
        globalConfig: { ...GLOBAL, ...global },
        config: { ...PROJECT, ...project },
        tests: 2,
      }),
    ).toBe('stream')
  })

  it.each<[string, Partial<JestGlobalConfig>, Partial<JestProjectConfig>]>([
    ['a run that says nothing', {}, {}],
    ['a run that says no to both', { verbose: false, silent: false }, {}],
    [
      'a project that says no to verbose in a verbose run',
      { verbose: true },
      { verbose: false },
    ],
  ])(
    'keeps what tests print for the results in %s',
    (_name, global, project) => {
      expect(
        getJestConsole({
          globalConfig: { ...GLOBAL, ...global },
          config: { ...PROJECT, ...project },
          tests: 2,
        }),
      ).toBe('buffer')
    },
  )

  it('writes at once in a run of one test file', () => {
    expect(
      getJestConsole({ globalConfig: GLOBAL, config: PROJECT, tests: 1 }),
    ).toBe('stream')
  })

  it.each<[string, Partial<JestGlobalConfig>, Partial<JestProjectConfig>]>([
    ['says no to verbose', { verbose: false }, {}],
    [
      'is silent, where a project says no to silent',
      { silent: true },
      { silent: false },
    ],
    ['has a project that says no to verbose', {}, { verbose: false }],
  ])(
    'keeps what tests print in a run of one test file that %s',
    (_name, global, project) => {
      expect(
        getJestConsole({
          globalConfig: { ...GLOBAL, ...global },
          config: { ...PROJECT, ...project },
          tests: 1,
        }),
      ).toBe('buffer')
    },
  )
})
