import { describe, expect, it } from 'vitest'

import { validatePlugin } from '../../../core/plugins/validate-plugin'

/**
 * Mutator with the shape the checks accept.
 */
const MUTATOR = {
  meta: { description: 'Swaps a thing.' },
  create: () => ({}),
}

describe('validatePlugin', () => {
  it.each([
    { mutators: {} },
    { mutators: { swap: MUTATOR } },
    {
      mutators: {
        swap: {
          ...MUTATOR,
          meta: {
            defaultOptions: { deep: false },
            description: 'Swaps a thing.',
            countsForSolitary: false,
          },
        },
      },
    },
    {
      presets: {
        all: {
          mutators: { 'acme/swap': ['on', { deep: true }] },
          settings: { timeouts: true },
          description: 'Everything.',
          extends: ['recommended'],
        },
      },
      mutators: { swap: MUTATOR },
    },
    {
      presets: { bare: { description: 'Nothing.', mutators: {} } },
      mutators: {},
    },
  ])('accepts %o', plugin => {
    expect(validatePlugin(plugin, 'acme')).toBe(plugin)
  })

  it.each<[unknown, string]>([
    [null, 'it must be an object'],
    [{}, '"mutators" must be an object'],
    [{ mutators: { swap: 1 } }, 'mutator "swap" must be an object'],
    [
      { mutators: { swap: { meta: MUTATOR.meta } } },
      'mutator "swap" has no create function',
    ],
    [
      { mutators: { swap: { create: MUTATOR.create, meta: {} } } },
      'mutator "swap" has no meta.description',
    ],
    [
      { mutators: { swap: { create: MUTATOR.create } } },
      'mutator "swap" has no meta.description',
    ],
    [
      {
        mutators: {
          swap: { ...MUTATOR, meta: { defaultOptions: 1, description: 'x' } },
        },
      },
      'mutator "swap" has meta.defaultOptions that is not an object',
    ],
    [
      {
        mutators: {
          swap: {
            ...MUTATOR,
            meta: { countsForSolitary: 'no', description: 'x' },
          },
        },
      },
      'mutator "swap" has meta.countsForSolitary that is not true or false',
    ],
    [{ mutators: {}, presets: [] }, '"presets" must be an object'],
    [{ presets: { all: 1 }, mutators: {} }, 'preset "all" must be an object'],
    [
      { presets: { all: { mutators: {} } }, mutators: {} },
      'preset "all" has no description',
    ],
    [
      { presets: { all: { description: 'x' } }, mutators: {} },
      'preset "all" has "mutators" that is not an object',
    ],
    [
      {
        presets: {
          all: { mutators: { 'acme/swap': 'yes' }, description: 'x' },
        },
        mutators: {},
      },
      'preset "all" has an invalid setting for "acme/swap": use "on", "off" or ["on", options]',
    ],
    [
      {
        presets: { all: { extends: 'strict', description: 'x', mutators: {} } },
        mutators: {},
      },
      'preset "all" has "extends" that is not a list of preset ids',
    ],
    [
      {
        presets: { all: { description: 'x', mutators: {}, extends: [1] } },
        mutators: {},
      },
      'preset "all" has "extends" that is not a list of preset ids',
    ],
    [
      {
        presets: {
          all: { settings: { timeouts: 1 }, description: 'x', mutators: {} },
        },
        mutators: {},
      },
      'preset "all" has invalid settings: "timeouts" is not true or false',
    ],
  ])('rejects %o', (plugin, problem) => {
    expect(() => validatePlugin(plugin, 'acme')).toThrow(
      `Plugin "acme" is invalid: ${problem}.`,
    )
  })
})
