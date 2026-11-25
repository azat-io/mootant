import { describe, expect, it, vi } from 'vitest'

import { getDrySnapshotKey } from '../../../core/cache/get-dry-snapshot-key'
import { TEST_LIMITS } from '../../helpers/create-test-run'

/**
 * Inputs of the keys of the tests unless a test changes them.
 */
const INPUTS: Parameters<typeof getDrySnapshotKey>[0] = {
  setup: {
    mutators: [{ options: {}, id: 'a' }] as never,
    file: '/p/mootant.config.ts',
    preset: 'recommended',
    settings: {},
  },
  switched: [
    { switched: 'let a = s(1)', original: 'let a = 1', file: '/p/src/a.ts' },
  ],
  adapter: { version: '0.1.0', name: 'vitest' } as never,
  context: { parallelUnits: false, concurrency: null },
  related: ['/p/src/a.ts', '/p/src/b.ts'],
  limits: TEST_LIMITS,
  root: '/p',
}

/**
 * Builds a key from inputs that differ from the defaults.
 *
 * @param fields - Inputs to change.
 * @returns SHA-256 in hex.
 */
function getKey(
  fields: Partial<Parameters<typeof getDrySnapshotKey>[0]> = {},
): string {
  return getDrySnapshotKey({ ...INPUTS, ...fields })
}

describe('getDrySnapshotKey', () => {
  it('is the same for the same inputs', () => {
    expect(getKey()).toMatch(/^[\da-f]{64}$/u)
    expect(getKey()).toBe(getKey())
  })

  it.each<[string, Partial<Parameters<typeof getDrySnapshotKey>[0]>]>([
    [
      'the text with the mutants',
      {
        switched: [
          {
            switched: 'let a = s(2)',
            original: 'let a = 1',
            file: '/p/src/a.ts',
          },
        ],
      },
    ],
    [
      'the text read',
      {
        switched: [
          {
            switched: 'let a = s(1)',
            original: 'let a = 2',
            file: '/p/src/a.ts',
          },
        ],
      },
    ],
    ['the switched files', { switched: [] }],
    ['the related files', { related: ['/p/src/a.ts'] }],
    [
      'the limits',
      { limits: { ...TEST_LIMITS, timeout: { constant: 1, factor: 1 } } },
    ],
    ['the mutators', { setup: { ...INPUTS.setup, mutators: [] } }],
    ['the preset settings', { setup: { ...INPUTS.setup, settings: { a: 1 } } }],
    ['the preset', { setup: { ...INPUTS.setup, preset: 'strict' } }],
    [
      'the configuration file',
      { setup: { ...INPUTS.setup, file: '/p/mootant.e2e.config.ts' } },
    ],
    ['the lack of one', { setup: { ...INPUTS.setup, file: null } }],
    ['the concurrency', { context: { ...INPUTS.context, concurrency: 2 } }],
    ['parallel units', { context: { ...INPUTS.context, parallelUnits: true } }],
    ['the adapter', { adapter: { name: 'jest' } as never }],
    ['the root', { root: '/q' }],
  ])('changes with %s', (_name, fields) => {
    expect(getKey(fields)).not.toBe(getKey())
  })

  it('changes with the working directory', () => {
    let before = getKey()
    vi.spyOn(process, 'cwd').mockReturnValueOnce('/p/src')

    expect(getKey()).not.toBe(before)
    expect(getKey()).toBe(before)
  })
})
