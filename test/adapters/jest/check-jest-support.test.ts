import { describe, expect, it } from 'vitest'

import type { JestGlobalConfig } from '../../../adapters/jest/types/jest-global-config'

import { checkJestSupport } from '../../../adapters/jest/check-jest-support'

/**
 * Creates a configuration with the given global settings.
 *
 * @param globalConfig - What differs from the default.
 * @returns The configuration.
 */
function createConfig(
  globalConfig: Partial<JestGlobalConfig> = {},
): Parameters<typeof checkJestSupport>[0]['config'] {
  return {
    globalConfig: {
      detectOpenHandles: false,
      testSequencer: '/s.js',
      maxWorkers: 1,
      ...globalConfig,
    },
    configs: [],
  }
}

describe('checkJestSupport', () => {
  it('accepts a project without what it refuses', () => {
    expect(() => {
      checkJestSupport({ env: { JEST_JASMINE: '0' }, config: createConfig() })
    }).not.toThrow()
  })

  it('refuses JEST_JASMINE=1', () => {
    expect(() => {
      checkJestSupport({ env: { JEST_JASMINE: '1' }, config: createConfig() })
    }).toThrow(
      'mootant runs Jest with jest-circus, but JEST_JASMINE=1 selects jest-jasmine2; unset the variable.',
    )
  })

  it.each([null, ''])(
    'accepts changedSince of %j, which Jest ignores',
    value => {
      expect(() => {
        checkJestSupport({
          config: createConfig({ changedSince: value }),
          env: {},
        })
      }).not.toThrow()
    },
  )

  it('refuses changedSince in the configuration', () => {
    expect(() => {
      checkJestSupport({
        config: createConfig({ changedSince: 'main' }),
        env: {},
      })
    }).toThrow(
      'mootant runs every test file, but the Jest configuration sets changedSince; remove it from the configuration.',
    )
  })
})
