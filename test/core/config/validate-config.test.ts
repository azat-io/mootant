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
  ])('rejects %o', (config, problem) => {
    expect(() => validateConfig(config, '.mootantrc.json')).toThrow(
      `Invalid configuration in .mootantrc.json: ${problem}.`,
    )
  })
})
