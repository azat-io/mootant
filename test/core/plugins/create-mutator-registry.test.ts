import { describe, expect, it } from 'vitest'

import type { MutatorRegistry } from '../../../types/mutator-registry'
import type { Mutator } from '../../../types/mutator'
import type { Plugin } from '../../../types/plugin'
import type { Preset } from '../../../types/preset'

import { createMutatorRegistry } from '../../../core/plugins/create-mutator-registry'

/**
 * Plugins that make the registry throw.
 */
interface RegistryError {
  /**
   * Plugins keyed by namespace.
   */
  plugins: Record<string, Plugin>

  /**
   * Message of the error.
   */
  message: string

  /**
   * Core plugin.
   */
  core: Plugin
}

/**
 * Builds a preset that turns on the given mutators.
 *
 * @param mutatorIds - Ids of the mutators to turn on.
 * @returns Preset object.
 */
function createPreset(mutatorIds: string[]): Preset {
  return {
    mutators: Object.fromEntries(mutatorIds.map(id => [id, 'on'])),
    description: 'Preset of the test.',
  }
}

/**
 * Lists the registered mutators in iteration order.
 *
 * @param registry - Registry to read.
 * @returns Id and rank of every mutator.
 */
function listRanks(registry: MutatorRegistry): [string, number][] {
  return Array.from(registry.mutators.values(), ({ rank, id }) => [id, rank])
}

/**
 * Builds a mutator that returns no visitors.
 *
 * @param description - Sentence that reports print next to its mutants.
 * @returns Mutator module.
 */
function createMutator(description: string): Mutator {
  return {
    meta: { description },
    create: () => ({}),
  }
}

describe('createMutatorRegistry', () => {
  it('registers core mutators under their names in name order', () => {
    let stringLiteral = createMutator('Strings.')
    let arithmetic = createMutator('Arithmetic.')
    let registry = createMutatorRegistry(
      {
        mutators: {
          'arithmetic-operator': arithmetic,
          'string-literal': stringLiteral,
        },
      },
      {},
    )

    expect([...registry.mutators]).toStrictEqual([
      [
        'arithmetic-operator',
        { id: 'arithmetic-operator', mutator: arithmetic, rank: 0 },
      ],
      [
        'string-literal',
        { mutator: stringLiteral, id: 'string-literal', rank: 1 },
      ],
    ])
    expect(registry.presets.size).toBe(0)
  })

  it('ranks namespaced mutators after the core ones, by namespace and name', () => {
    let registry = createMutatorRegistry(
      { mutators: { alpha: createMutator('A.'), beta: createMutator('B.') } },
      {
        acme: {
          mutators: {
            'no-await': createMutator('N.'),
            'a-rule': createMutator('R.'),
          },
        },
        zeta: { mutators: { first: createMutator('Z1.') } },
      },
    )

    expect(listRanks(registry)).toStrictEqual([
      ['alpha', 0],
      ['beta', 1],
      ['acme/a-rule', 2],
      ['acme/no-await', 3],
      ['zeta/first', 4],
    ])
  })

  it('gives the same ranks whatever the order of the object keys', () => {
    let mutators = {
      'c-rule': createMutator('C.'),
      'a-rule': createMutator('A.'),
      'b-rule': createMutator('B.'),
    }
    let reversed = Object.fromEntries(Object.entries(mutators).toReversed())
    let registry = createMutatorRegistry({ mutators }, { other: { mutators } })
    let reversedRegistry = createMutatorRegistry(
      { mutators: reversed },
      { other: { mutators: reversed } },
    )

    expect(listRanks(reversedRegistry)).toStrictEqual(listRanks(registry))
  })

  it('registers core presets by name and plugin presets by namespace and name', () => {
    let recommended = createPreset(['alpha'])
    let strict = createPreset(['acme/no-await'])
    let registry = createMutatorRegistry(
      { mutators: { alpha: createMutator('A.') }, presets: { recommended } },
      {
        acme: {
          mutators: { 'no-await': createMutator('N.') },
          presets: { strict },
        },
      },
    )

    expect([...registry.presets]).toStrictEqual([
      ['recommended', recommended],
      ['acme/strict', strict],
    ])
  })

  it.each<RegistryError>([
    {
      message:
        'Mutator name "StringLiteral" in the core plugin is not kebab-case.',
      core: { mutators: { StringLiteral: createMutator('S.') } },
      plugins: {},
    },
    {
      core: {
        presets: { Recommended: createPreset([]) },
        mutators: {},
      },
      message:
        'Preset name "Recommended" in the core plugin is not kebab-case.',
      plugins: {},
    },
    {
      message: 'Plugin namespace "Acme" is not kebab-case.',
      plugins: { Acme: { mutators: {} } },
      core: { mutators: {} },
    },
    {
      message: 'Plugin namespace "acme/tools" is not kebab-case.',
      plugins: { 'acme/tools': { mutators: {} } },
      core: { mutators: {} },
    },
    {
      message: 'Mutator name "noAwait" in plugin "acme" is not kebab-case.',
      plugins: { acme: { mutators: { noAwait: createMutator('N.') } } },
      core: { mutators: {} },
    },
    {
      plugins: {
        acme: { presets: { 'all rules': createPreset([]) }, mutators: {} },
      },
      message: 'Preset name "all rules" in plugin "acme" is not kebab-case.',
      core: { mutators: {} },
    },
  ])('throws "$message"', ({ message, plugins, core }) => {
    expect(() => createMutatorRegistry(core, plugins)).toThrow(
      new Error(message),
    )
  })
})
