import { describe, expect, it } from 'vitest'

import type { WorkerProject } from '../../../../adapters/jest/types/worker-project'

import { wrapProjectConfig } from '../../../../adapters/jest/worker/wrap-project-config'

/**
 * Creates a project configuration with a transformer of its own, and with the
 * settings a copy overrides set the other way.
 *
 * @returns The configuration.
 */
function createConfig(): {
  testLocationInResults: boolean
  detectLeaks: boolean
  verbose: boolean
  silent: boolean
  cache: boolean
} & WorkerProject['config'] {
  return {
    transform: [
      [String.raw`\.js$`, '/project/transformer.js', { option: true }],
      ['^', '/project/all.js', {}],
    ],
    transformIgnorePatterns: ['/node_modules/'],
    testEnvironment: '/project/environment.js',
    setupFiles: ['/project/setup.js'],
    runner: '/project/runner-file.js',
    testRunner: '/project/runner.js',
    testLocationInResults: false,
    moduleFileExtensions: ['js'],
    snapshotSerializers: [],
    setupFilesAfterEnv: [],
    rootDir: '/project',
    roots: ['/project'],
    detectLeaks: true,
    verbose: true,
    silent: true,
    cache: false,
    id: 'p',
  }
}

describe('wrapProjectConfig', () => {
  it('makes the copy a unit runs', () => {
    let config = createConfig()

    expect(
      wrapProjectConfig(config, '/work/plan.json', '/work/jest'),
    ).toStrictEqual({
      ...config,
      transform: [
        [
          String.raw`\.js$`,
          '/work/jest/transformer.cjs',
          {
            real: '/project/transformer.js',
            realConfig: { option: true },
            plan: '/work/plan.json',
          },
        ],
        [
          '^',
          '/work/jest/transformer.cjs',
          {
            real: '/project/all.js',
            plan: '/work/plan.json',
            realConfig: {},
          },
        ],
        [
          '^(?:)',
          '/work/jest/transformer.cjs',
          { plan: '/work/plan.json', real: null },
        ],
      ],
      setupFiles: [
        '/work/jest/vm-setup.cjs',
        '/project/setup.js',
        '/work/jest/vm-setup-end.cjs',
      ],
      transformIgnorePatterns: ['^/work/jest/', '/node_modules/'],
      testRunner: '/work/jest/test-runner.cjs',
      testLocationInResults: true,
      detectLeaks: false,
      verbose: undefined,
      silent: undefined,
      cache: true,
    })
  })

  it('leaves the last setup file out when the test environment and the test runner are packages', () => {
    let config = {
      ...createConfig(),
      testEnvironment:
        '/project/node_modules/jest-environment-node/build/index.js',
      testRunner: '/project/node_modules/jest-circus/runner.js',
    }

    expect(
      wrapProjectConfig(config, '/work/plans/1/plan.json', '/work/jest')
        .setupFiles,
    ).toStrictEqual(['/work/jest/vm-setup.cjs', '/project/setup.js'])
  })

  it('passes a run with no plan on as null', () => {
    let { transform } = wrapProjectConfig(createConfig(), null, '/work/jest')

    expect(
      transform.map(entry => (entry[2] as { plan: null }).plan),
    ).toStrictEqual([null, null, null])
  })

  it('keeps the transformer of a project with its own ^ apart from the catch-all', () => {
    let { transform } = wrapProjectConfig(createConfig(), null, '/work/jest')
    let own = transform[1]!
    let last = transform.at(-1)!
    let keys = new Set(
      transform.map(([pattern, file]) => {
        let { source } = new RegExp(pattern, 'u')
        return source + file
      }),
    )

    expect(own[0]).toBe('^')
    expect(last[0]).not.toBe(own[0])
    expect(keys.size).toBe(transform.length)
  })

  it('matches every file with the catch-all', () => {
    let { transform } = wrapProjectConfig(createConfig(), null, '/work/jest')
    let pattern = new RegExp(transform.at(-1)![0], 'u')

    expect(pattern.test('/project/file.unknown')).toBe(true)
    expect(pattern.test('')).toBe(true)
  })

  it('escapes the characters of a work path that mean something in a pattern', () => {
    let directory = '/tmp/a+b (c)[d]{e}^f$g.h|i*j?k/jest'
    let { transformIgnorePatterns } = wrapProjectConfig(
      createConfig(),
      null,
      directory,
    )
    let pattern = new RegExp(transformIgnorePatterns[0]!, 'u')

    expect(pattern.test(`${directory}/vm-setup.cjs`)).toBe(true)
    expect(
      pattern.test('/tmp/aab (c)[d]{e}^f$g.h|i*j?k/jest/vm-setup.cjs'),
    ).toBe(false)
    expect(pattern.test(`/outside${directory}/vm-setup.cjs`)).toBe(false)
    expect(pattern.test(`${directory}-other/vm-setup.cjs`)).toBe(false)
  })

  it('escapes a backslash of a work path', () => {
    let { transformIgnorePatterns } = wrapProjectConfig(
      createConfig(),
      null,
      String.raw`C:\work\jest`,
    )
    let pattern = new RegExp(transformIgnorePatterns[0]!, 'u')

    expect(pattern.test(String.raw`C:\work\jest/vm-setup.cjs`)).toBe(true)
  })

  it('does not change its input', () => {
    let config = createConfig()
    let copy = structuredClone(config)
    wrapProjectConfig(config, '/work/plan.json', '/work/jest')

    expect(config).toStrictEqual(copy)
  })
})
