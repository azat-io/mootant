import { describe, expect, it } from 'vitest'

import { INSTRUMENTER_VERSION } from '../../../core/instrument/instrumenter-version'
import { getEnvironmentKey } from '../../../core/cache/get-environment-key'
import { RUNTIME_VERSION } from '../../../core/runtime/runtime-version'
import { listFileHashes } from '../../../core/cache/list-file-hashes'
import { CACHE_VERSION } from '../../../core/cache/cache-version'
import { createDigest } from '../../../core/cache/create-digest'
import { TEST_LIMITS } from '../../helpers/create-test-run'
import { version } from '../../../package.json'

/**
 * Inputs of the keys of the tests unless a test changes them.
 */
const INPUTS: Parameters<typeof getEnvironmentKey>[0] = {
  hashes: new Map([
    ['/p/vitest.config.ts', 'h1'],
    ['/p/.env', null],
  ]),
  mutators: { mutators: [['a', {}]], preset: 'recommended', settings: {} },
  runner: { adapter: 'vitest', version: '0.1.0', runner: '5.0.4' },
  files: ['/p/vitest.config.ts', '/p/.env'],
  settings: [{ pool: 'forks' }],
  limits: TEST_LIMITS,
  root: '/p',
  build: 1,
}

/**
 * Builds an environment key from inputs that differ from the defaults.
 *
 * @param fields - Inputs to change.
 * @returns SHA-256 in hex.
 */
function getKey(
  fields: Partial<Parameters<typeof getEnvironmentKey>[0]> = {},
): string {
  return getEnvironmentKey({ ...INPUTS, ...fields })
}

describe('getEnvironmentKey', () => {
  it('is the same for the same inputs, whatever the order of files', () => {
    expect(getKey()).toMatch(/^[\da-f]{64}$/u)
    expect(
      getKey({ files: ['/p/.env', '/p/vitest.config.ts', '/p/.env'] }),
    ).toBe(getKey())
  })

  it.each<[string, Partial<Parameters<typeof getEnvironmentKey>[0]>]>([
    ['a file hash', { hashes: new Map([['/p/vitest.config.ts', 'h2']]) }],
    ['a created file', { hashes: new Map([['/p/.env', 'h3']]) }],
    ['the files', { files: ['/p/vitest.config.ts'] }],
    ['the settings of the test runner', { settings: undefined }],
    [
      'the runner',
      { runner: { adapter: 'vitest', runner: '5.0.4', version: null } },
    ],
    [
      'the mutators',
      { mutators: { preset: 'recommended', mutators: [], settings: {} } },
    ],
    [
      'the limits',
      { limits: { ...TEST_LIMITS, timeout: { constant: 1, factor: 3 } } },
    ],
    ['the build', { build: 2 }],
    ['parallel units', { parallelUnits: true }],
  ])('changes with %s', (_name, fields) => {
    expect(getKey(fields)).not.toBe(getKey())
  })

  it('keeps the parts of the key a run had before parallel units, and adds one only with them', () => {
    let parts = [
      CACHE_VERSION,
      version,
      INPUTS.build,
      INSTRUMENTER_VERSION,
      RUNTIME_VERSION,
      INPUTS.runner,
      listFileHashes(INPUTS.files, INPUTS),
      INPUTS.settings,
      INPUTS.limits,
      INPUTS.mutators,
      process.versions.node.split('.', 1)[0],
      process.platform,
      process.arch,
    ]

    expect(getKey()).toBe(createDigest(parts))
    expect(getKey({ parallelUnits: false })).toBe(createDigest(parts))
    expect(getKey({ parallelUnits: true })).toBe(
      createDigest([...parts, 'parallel-units']),
    )
  })

  it('hashes paths relative to the root', () => {
    expect(
      getKey({
        hashes: new Map([
          ['/q/vitest.config.ts', 'h1'],
          ['/q/.env', null],
        ]),
        files: ['/q/vitest.config.ts', '/q/.env'],
        root: '/q',
      }),
    ).toBe(getKey())
  })
})
