import { describe, expect, it } from 'vitest'

import type { MutatorRegistry } from '../../../types/mutator/mutator-registry'
import type { PresetSettings } from '../../../types/config/preset-settings'
import type { Mutator } from '../../../types/mutator/mutator'
import type { Preset } from '../../../types/config/preset'

import { createMutatorRegistry } from '../../../core/plugins/create-mutator-registry'
import { resolvePreset } from '../../../core/plugins/resolve-preset'

/**
 * Presets whose resolved settings are checked.
 */
interface SettingsCase {
  /**
   * Core presets keyed by name.
   */
  presets: Record<string, Preset>

  /**
   * Settings expected after resolution.
   */
  expected: PresetSettings

  /**
   * Preset to resolve.
   */
  presetId: string

  /**
   * Title of the case.
   */
  name: string
}

/**
 * Options of the mutators of the test.
 */
interface TestOptions {
  /**
   * Option that strict presets change.
   */
  anyReceiver?: boolean

  /**
   * Option that no preset changes.
   */
  caseTests?: boolean

  /**
   * Option without a default.
   */
  extra?: string
}

/**
 * Presets that make the resolution of `top` throw.
 */
interface PresetError {
  /**
   * Core presets keyed by name.
   */
  presets: Record<string, Preset>

  /**
   * Message of the error.
   */
  message: string
}

/**
 * Builds a registry of three core mutators, one plugin mutator and the given
 * core presets.
 *
 * @param presets - Core presets keyed by name.
 * @returns Registry of the test.
 */
function createRegistry(presets: Record<string, Preset>): MutatorRegistry {
  return createMutatorRegistry(
    {
      mutators: {
        'method-call': createMutator({ anyReceiver: false, caseTests: false }),
        'string-literal': createMutator({ caseTests: false }),
        'boolean-literal': createMutator(),
      },
      presets,
    },
    {
      acme: {
        presets: { extra: { description: 'Extra.', mutators: {} } },
        mutators: { 'no-await': createMutator() },
      },
    },
  )
}

/**
 * Turns resolved mutators into id and option pairs.
 *
 * @param registry - Registry of the test.
 * @param presetId - Preset to resolve.
 * @returns Id and options of every active mutator, in order.
 */
function resolveOptions(
  registry: MutatorRegistry,
  presetId: string,
): [string, object][] {
  return resolvePreset(registry, presetId).mutators.map(({ options, id }) => [
    id,
    options,
  ])
}

/**
 * Builds a mutator with default options.
 *
 * @param defaultOptions - Options used when a preset gives none, or undefined.
 * @returns Mutator module.
 */
function createMutator(defaultOptions?: TestOptions): Mutator<TestOptions> {
  return {
    meta: { description: 'Mutator of the test.', defaultOptions },
    create: () => ({}),
  }
}

/**
 * Preset that turns every mutator of the test registry on.
 */
const BASE: Preset = {
  mutators: {
    'boolean-literal': 'on',
    'string-literal': 'on',
    'acme/no-await': 'on',
    'method-call': 'on',
  },
  description: 'Every mutator.',
  settings: { timeouts: false },
}

describe('resolvePreset', () => {
  it('turns on the mentioned mutators in rank order with their default options', () => {
    let registry = createRegistry({ base: BASE })

    expect(resolveOptions(registry, 'base')).toStrictEqual([
      ['boolean-literal', {}],
      ['method-call', { anyReceiver: false, caseTests: false }],
      ['string-literal', { caseTests: false }],
      ['acme/no-await', {}],
    ])
  })

  it('returns registered mutators with their rank, id and module', () => {
    let registry = createRegistry({ base: BASE })
    let [first] = resolvePreset(registry, 'base').mutators

    expect(first).toStrictEqual({
      ...registry.mutators.get('boolean-literal'),
      options: {},
    })
  })

  it('leaves off the mutators that are off or not mentioned', () => {
    let registry = createRegistry({
      partial: {
        mutators: { 'string-literal': 'off', 'method-call': 'on' },
        description: 'Some mutators.',
      },
    })

    expect(resolveOptions(registry, 'partial')).toStrictEqual([
      ['method-call', { anyReceiver: false, caseTests: false }],
    ])
  })

  it('merges preset options over the default options and freezes them', () => {
    let registry = createRegistry({
      custom: {
        mutators: {
          'method-call': ['on', { anyReceiver: true, extra: 'value' }],
          'boolean-literal': ['on', { extra: 'flag' }],
        },
        description: 'Options.',
      },
    })
    let { mutators } = resolvePreset(registry, 'custom')

    expect(mutators.map(({ options, id }) => [id, options])).toStrictEqual([
      ['boolean-literal', { extra: 'flag' }],
      ['method-call', { anyReceiver: true, caseTests: false, extra: 'value' }],
    ])
    expect(mutators.every(({ options }) => Object.isFrozen(options))).toBe(true)
  })

  it('applies extended presets first and lets the extending entries win', () => {
    let registry = createRegistry({
      strict: {
        mutators: {
          'method-call': ['on', { anyReceiver: true }],
          'string-literal': 'off',
        },
        description: 'Stricter.',
        extends: ['base'],
      },
      base: BASE,
    })

    expect(resolveOptions(registry, 'strict')).toStrictEqual([
      ['boolean-literal', {}],
      ['method-call', { anyReceiver: true, caseTests: false }],
      ['acme/no-await', {}],
    ])
  })

  it('merges an extending entry over the defaults, not over the inherited options', () => {
    let registry = createRegistry({
      child: {
        mutators: { 'method-call': ['on', { caseTests: true }] },
        description: 'Child.',
        extends: ['parent'],
      },
      parent: {
        mutators: { 'method-call': ['on', { anyReceiver: true }] },
        description: 'Parent.',
      },
    })

    expect(resolveOptions(registry, 'child')).toStrictEqual([
      ['method-call', { anyReceiver: false, caseTests: true }],
    ])
  })

  it('applies several extended presets in order, later ones winning', () => {
    let registry = createRegistry({
      second: {
        mutators: { 'method-call': ['on', { extra: 'second' }] },
        description: 'Second.',
      },
      first: {
        mutators: { 'method-call': ['on', { extra: 'first' }] },
        description: 'First.',
      },
      both: {
        extends: ['first', 'second'],
        description: 'Both.',
        mutators: {},
      },
    })

    expect(resolveOptions(registry, 'both')).toStrictEqual([
      [
        'method-call',
        { anyReceiver: false, caseTests: false, extra: 'second' },
      ],
    ])
  })

  it('resolves a preset reached twice through extends', () => {
    let registry = createRegistry({
      diamond: {
        extends: ['left', 'right'],
        description: 'Diamond.',
        mutators: {},
      },
      right: { description: 'Right.', extends: ['base'], mutators: {} },
      left: { description: 'Left.', extends: ['base'], mutators: {} },
      base: BASE,
    })

    expect(resolveOptions(registry, 'diamond')).toHaveLength(4)
  })

  it('resolves a plugin preset by its namespaced id', () => {
    let registry = createRegistry({})

    expect(resolvePreset(registry, 'acme/extra')).toStrictEqual({
      settings: { coarseMutants: false, timeouts: false },
      mutators: [],
    })
  })

  it.each<SettingsCase>([
    {
      presets: { base: { description: 'No settings.', mutators: {} } },
      name: 'defaults timeouts and coarse mutants to false',
      expected: { coarseMutants: false, timeouts: false },
      presetId: 'base',
    },
    {
      presets: {
        base: {
          settings: { timeouts: true },
          description: 'Timeouts.',
          mutators: {},
        },
        child: { description: 'Child.', extends: ['base'], mutators: {} },
      },
      expected: { coarseMutants: false, timeouts: true },
      name: 'inherits settings through extends',
      presetId: 'child',
    },
    {
      presets: {
        child: {
          settings: { timeouts: false },
          description: 'Child.',
          extends: ['base'],
          mutators: {},
        },
        base: {
          settings: { timeouts: true },
          description: 'Base.',
          mutators: {},
        },
      },
      expected: { coarseMutants: false, timeouts: false },
      name: 'lets the extending settings win',
      presetId: 'child',
    },
    {
      presets: {
        child: {
          description: 'Child.',
          extends: ['base'],
          settings: {},
          mutators: {},
        },
        base: {
          settings: { timeouts: true },
          description: 'Base.',
          mutators: {},
        },
      },
      name: 'keeps inherited keys the extending preset does not set',
      expected: { coarseMutants: false, timeouts: true },
      presetId: 'child',
    },
  ])('$name', ({ presetId, expected, presets }) => {
    let registry = createRegistry(presets)
    let { settings } = resolvePreset(registry, presetId)

    expect(settings).toStrictEqual(expected)
    expect(Object.isFrozen(settings)).toBe(true)
  })

  it.each([
    {
      message:
        // spell-checker: disable-next-line
        'Unknown preset "recomended". Did you mean "recommended"? Available presets: acme/extra, recommended, strict.',
      // spell-checker: disable-next-line
      presetId: 'recomended',
    },
    {
      message:
        'Unknown preset "everything". Available presets: acme/extra, recommended, strict.',
      presetId: 'everything',
    },
  ])('throws for the unknown preset $presetId', ({ presetId, message }) => {
    let registry = createRegistry({
      strict: { description: 'Strict.', mutators: {} },
      recommended: BASE,
    })

    expect(() => resolvePreset(registry, presetId)).toThrow(new Error(message))
  })

  it.each<PresetError>([
    {
      presets: {
        top: { extends: ['missing'], description: 'Top.', mutators: {} },
      },
      message: 'Preset "top" extends unknown preset "missing".',
    },
    {
      presets: {
        top: { description: 'Top.', extends: ['top'], mutators: {} },
      },
      message: 'Preset "top" extends itself through "top".',
    },
    {
      presets: {
        middle: { description: 'Middle.', extends: ['top'], mutators: {} },
        top: { description: 'Top.', extends: ['middle'], mutators: {} },
      },
      message: 'Preset "top" extends itself through "middle".',
    },
    {
      presets: {
        bottom: { description: 'Bottom.', extends: ['middle'], mutators: {} },
        middle: { description: 'Middle.', extends: ['bottom'], mutators: {} },
        top: { description: 'Top.', extends: ['middle'], mutators: {} },
      },
      message: 'Preset "middle" extends itself through "bottom".',
    },
    {
      presets: {
        top: {
          // spell-checker: disable-next-line
          mutators: { 'string-literl': 'on' },
          description: 'Top.',
        },
      },
      // spell-checker: disable-next-line
      message: 'Preset "top" refers to unknown mutator "string-literl".',
    },
    {
      presets: {
        top: {
          // spell-checker: disable-next-line
          mutators: { 'string-literl': 'off' },
          description: 'Top.',
        },
      },
      // spell-checker: disable-next-line
      message: 'Preset "top" refers to unknown mutator "string-literl".',
    },
    {
      presets: {
        base: { mutators: { 'no-await': 'on' }, description: 'Base.' },
        top: { description: 'Top.', extends: ['base'], mutators: {} },
      },
      message: 'Preset "base" refers to unknown mutator "no-await".',
    },
  ])('throws "$message"', ({ message, presets }) => {
    let registry = createRegistry(presets)

    expect(() => resolvePreset(registry, 'top')).toThrow(new Error(message))
  })
})
