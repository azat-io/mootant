import { describe, expect, it } from 'vitest'
import { visitorKeys } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { createMutatorRegistry } from '../../../core/plugins/create-mutator-registry'
import { isKebabCaseName } from '../../../core/plugins/is-kebab-case-name'
import { resolvePreset } from '../../../core/plugins/resolve-preset'
import { createTestFile } from '../../helpers/create-test-file'
import { corePlugin } from '../../../core/plugins/core-plugin'

/**
 * Node types that are never dispatched to visitors, because the runtime tree
 * leaves them and their subtrees out.
 */
let skippedTypes = new Set([
  'TSEmptyBodyFunctionExpression',
  'TSAbstractPropertyDefinition',
  'TSNamespaceExportDeclaration',
  'TSAbstractAccessorProperty',
  'TSAbstractMethodDefinition',
  'TSImportEqualsDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'ExportAllDeclaration',
  'ImportDeclaration',
  'TSDeclareFunction',
  'TSEnumDeclaration',
  'TSIndexSignature',
  'Decorator',
])

/**
 * Builds the context a mutator gets for a small sample file.
 *
 * @param id - Id of the mutator.
 * @param options - Resolved options of the mutator.
 * @returns Context over the sample file.
 */
function createSampleContext(id: string, options: object): MutatorContext {
  let { sourceCode, syntax, hints } = createTestFile(
    [
      'export function total(items: number[]): number {',
      '  let sum = 0',
      '  for (let item of items) {',
      '    sum += item > 0 ? item : -item',
      '  }',
      '  return sum',
      '}',
    ].join('\n'),
  )
  return {
    settings: Object.freeze({ coarseMutants: false, timeouts: false }),
    isEnabled: () => true,
    isActive: () => true,
    file: 'example.ts',
    sourceCode,
    options,
    syntax,
    hints,
    id,
  }
}

/**
 * Mutators and settings of a built-in preset.
 *
 * @param presetId - Name of a built-in preset, such as `strict`.
 * @returns Active mutators in rank order and the merged settings.
 */
function resolve(presetId: string): ReturnType<typeof resolvePreset> {
  return resolvePreset(createMutatorRegistry(corePlugin, {}), presetId)
}

describe('corePlugin', () => {
  it.each(Object.entries(corePlugin.mutators))(
    'registers %s with a kebab-case name, a description and create',
    (name, mutator) => {
      expect(isKebabCaseName(name)).toBe(true)
      expect(mutator.meta.description).toMatch(/^[A-Z][^\n]*\.$/u)
      expect(mutator.create).toBeTypeOf('function')
    },
  )

  it.each(resolve('strict').mutators)(
    'creates visitors of dispatched node types for $id',
    ({ mutator, options, id }) => {
      let visitors = mutator.create(createSampleContext(id, options))

      expect(
        Object.keys(visitors).filter(
          type => !Object.hasOwn(visitorKeys, type) || skippedTypes.has(type),
        ),
      ).toStrictEqual([])
      expect(
        Object.values(visitors).filter(visit => typeof visit !== 'function'),
      ).toStrictEqual([])
    },
  )

  it('lets only optional-chaining stay out of the solitary rule', () => {
    expect(
      Object.entries(corePlugin.mutators)
        .filter(([, mutator]) => mutator.meta.countsForSolitary === false)
        .map(([name]) => name),
    ).toStrictEqual(['optional-chaining'])
  })

  it('turns on every built-in mutator with its default options in recommended', () => {
    let { mutators, settings } = resolve('recommended')

    expect(mutators.map(active => active.id)).toStrictEqual(
      Object.keys(corePlugin.mutators).toSorted(),
    )
    expect(
      mutators.filter(
        active =>
          JSON.stringify(active.options) !==
          JSON.stringify(active.mutator.meta.defaultOptions ?? {}),
      ),
    ).toStrictEqual([])
    expect(settings).toStrictEqual({ coarseMutants: false, timeouts: false })
  })

  it('turns on in strict every mutator recommended turns on, with timeouts and coarse mutants', () => {
    let recommended = resolve('recommended')
    let strict = resolve('strict')

    expect(strict.mutators.map(active => active.id)).toStrictEqual(
      recommended.mutators.map(active => active.id),
    )
    expect(strict.settings).toStrictEqual({
      coarseMutants: true,
      timeouts: true,
    })
  })

  it('changes in strict only options that the mutators declare', () => {
    let { mutators } = resolve('strict')

    expect(
      mutators.filter(active =>
        Object.keys(active.options).some(
          key => !Object.hasOwn(active.mutator.meta.defaultOptions ?? {}, key),
        ),
      ),
    ).toStrictEqual([])
    expect(
      Object.fromEntries(
        mutators
          .filter(active => active.mutator.meta.defaultOptions)
          .map(active => [active.id, active.options]),
      ),
    ).toStrictEqual({
      'logical-operator': {
        nullishNormalization: true,
        nullishSwap: 'always',
      },
      'assignment-operator': { nullishSwap: 'always' },
      'optional-chaining': { nonNullable: true },
      'number-literal': { caseTests: true },
      'string-literal': { caseTests: true },
      'statement-removal': { jumps: true },
      'method-call': { anyReceiver: true },
    })
  })
})
