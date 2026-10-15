import { describe, expect, it } from 'vitest'

import { validateConfig } from '../../../core/config/validate-config'

describe('validateConfig', () => {
  it('rejects a script without a default export', () => {
    expect(() => validateConfig(undefined, 'mootant.config.js')).toThrow(
      'Invalid configuration in mootant.config.js: it must have a default export.',
    )
  })

  it.each([
    {},
    {
      mutators: { 'string-literal': 'off', 'acme/swap': ['on', {}] },
      plugins: { local: { mutators: {} } },
      settings: { coarseMutants: true },
      extends: ['strict'],
    },
    {
      run: {
        runner: { start: () => null, name: 'acme', batch: true },
        timeout: { constant: 100, factor: 2 },
        hitLimit: { factor: 10, floor: 1 },
        paths: ['src', 'lib'],
        concurrency: 4,
        threshold: 0,
        fast: true,
      },
    },
    { run: { runner: 'vitest', threshold: 100 } },
  ])('accepts %o', config => {
    expect(validateConfig(config, 'mootant.config.js')).toBe(config)
  })

  it.each<[unknown, string]>([
    [[], 'it must export an object'],
    [
      { extend: [] },
      '"extend" is not a configuration key (did you mean "extends"?)',
    ],
    [{ files: [] }, '"files" is not a configuration key'],
    [{ plugins: [] }, '"plugins" must be an object'],
    [
      { plugins: { acme: 'mootant-plugin-acme' } },
      'plugin "acme" must be a plugin object',
    ],
    [{ extends: 'strict' }, '"extends" must be a list of preset ids'],
    [{ extends: [1] }, '"extends" must be a list of preset ids'],
    [{ mutators: [] }, '"mutators" must be an object'],
    [
      { mutators: { 'string-literal': false } },
      'the setting of "string-literal" must be "on", "off" or ["on", options]',
    ],
    [
      { settings: { timeouts: 'yes' } },
      '"settings" are invalid: "timeouts" is not true or false',
    ],
    [{ run: [] }, '"run" is invalid: it must be an object'],
    [
      { run: { thresholds: 1 } },
      '"run" is invalid: "thresholds" is not a run setting (did you mean "threshold"?)',
    ],
    [
      { run: { cache: false } },
      '"run" is invalid: "cache" is not a run setting',
    ],
    [
      { run: { threshold: 101 } },
      '"run" is invalid: "threshold" must be a number from 0 to 100',
    ],
    [
      { run: { threshold: '80' } },
      '"run" is invalid: "threshold" must be a number from 0 to 100',
    ],
    [
      { run: { threshold: Number.NaN } },
      '"run" is invalid: "threshold" must be a number from 0 to 100',
    ],
    [
      { run: { concurrency: 1.5 } },
      '"run" is invalid: "concurrency" must be a positive integer',
    ],
    [
      { run: { concurrency: 0 } },
      '"run" is invalid: "concurrency" must be a positive integer',
    ],
    [{ run: { fast: 1 } }, '"run" is invalid: "fast" must be true or false'],
    [
      { run: { runner: '' } },
      '"run" is invalid: "runner" must be a built-in adapter name or an adapter object',
    ],
    [
      { run: { runner: 3 } },
      '"run" is invalid: "runner" must be a built-in adapter name or an adapter object',
    ],
    [
      { run: { paths: 'src' } },
      '"run" is invalid: "paths" must be a list of non-empty paths',
    ],
    [
      { run: { paths: [''] } },
      '"run" is invalid: "paths" must be a list of non-empty paths',
    ],
    [{ run: { timeout: 5 } }, '"run" is invalid: "timeout" must be an object'],
    [
      { run: { timeout: { floor: 5 } } },
      '"run" is invalid: "timeout.floor" is not a limit setting',
    ],
    [
      { run: { hitLimit: { factor: 0 } } },
      '"run" is invalid: "hitLimit.factor" must be a positive number',
    ],
    [
      { run: { hitLimit: { floor: Infinity } } },
      '"run" is invalid: "hitLimit.floor" must be a positive number',
    ],
    [
      { run: { timeout: { constant: '5' } } },
      '"run" is invalid: "timeout.constant" must be a positive number',
    ],
  ])('rejects %o', (config, problem) => {
    expect(() => validateConfig(config, '.mootantrc.json')).toThrow(
      `Invalid configuration in .mootantrc.json: ${problem}.`,
    )
  })
})
