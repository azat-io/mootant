import { describe, expect, it } from 'vitest'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'

import { listJestProjects } from '../../../adapters/jest/list-jest-projects'

/**
 * Runner of Jest as `--showConfig` prints it.
 */
let runner = '/p/node_modules/jest-runner/build/index.js'

/**
 * Creates a project configuration Jest would run.
 *
 * @param config - What differs from the default.
 * @returns The configuration.
 */
function createConfig(config: Partial<JestProjectConfig>): JestProjectConfig {
  return {
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
    id: 'id',
    runner,
    ...config,
  }
}

/**
 * Lists the names of the kept projects.
 *
 * @param configs - Project configurations.
 * @returns Their names.
 */
function listNames(configs: Partial<JestProjectConfig>[]): string[] {
  return listJestProjects({
    config: {
      globalConfig: {
        detectOpenHandles: false,
        testSequencer: '/s.js',
        maxWorkers: 1,
      },
      configs: configs.map(config => createConfig(config)),
    },
    root: '/p',
  }).projects.map(project => project.name)
}

describe('listJestProjects', () => {
  it('names no project when one is kept', () => {
    expect(listNames([{ displayName: { name: 'unit' } }])).toStrictEqual([''])
    expect(
      listNames([
        { displayName: { name: 'unit' } },
        { displayName: { name: 'lint' }, runner: '/p/lint.js' },
      ]),
    ).toStrictEqual([''])
  })

  it('names projects by display name, else by directory from the root', () => {
    expect(
      listNames([
        { displayName: { name: 'unit' }, rootDir: '/p/unit' },
        { rootDir: '/p/packages/a' },
        { rootDir: '/p' },
      ]),
    ).toStrictEqual(['unit', 'packages/a', ''])
  })

  it('adds a number to a name that repeats', () => {
    expect(
      listNames([
        { displayName: { name: 'unit-1' } },
        { displayName: { name: 'unit' } },
        { displayName: { name: 'unit' } },
        { displayName: { name: 'unit' } },
      ]),
    ).toStrictEqual(['unit-1', 'unit', 'unit-2', 'unit-3'])
  })

  it('reads Windows paths', () => {
    expect(
      listNames([
        { runner: String.raw`C:\p\node_modules\jest-runner\build\index.js` },
        {
          testRunner: String.raw`C:\p\node_modules\jest-jasmine2\build\index.js`,
          rootDir: '/p/jasmine',
        },
      ]),
    ).toStrictEqual([''])
  })

  it('skips other runners and jest-jasmine2 with a warning naming the project', () => {
    let kept = createConfig({})
    let { diagnostics, projects } = listJestProjects({
      config: {
        configs: [
          kept,
          createConfig({
            runner: '/p/node_modules/jest-runner-eslint/build/index.js',
            displayName: { name: 'lint' },
          }),
          createConfig({
            testRunner: '/p/node_modules/jest-jasmine2/build/index.js',
            rootDir: '/p/old',
          }),
          createConfig({ runner: '/p/my-jest-runner/build/index.js' }),
        ],
        globalConfig: {
          detectOpenHandles: false,
          testSequencer: '/s.js',
          maxWorkers: 1,
        },
      },
      root: '/p',
    })

    expect(projects).toStrictEqual([{ config: kept, name: '' }])
    expect(diagnostics).toStrictEqual(
      ['lint', '/p/old', '/p'].map(name => ({
        message: `mootant runs only Jest's own runner with jest-circus, so it skips the Jest project ${name}.`,
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      })),
    )
  })

  it('refuses a configuration with no project left', () => {
    expect(() => listNames([{ runner: '/p/lint.js' }])).toThrow(
      "mootant runs only Jest's own runner with jest-circus, and no Jest project in /p uses them; set them in the Jest configuration.",
    )
  })
})
