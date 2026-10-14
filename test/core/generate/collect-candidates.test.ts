import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { MutatorContext } from '../../../types/mutator-context'
import type { ActiveMutator } from '../../../types/active-mutator'
import type { Mutator } from '../../../types/mutator'

import { parseIgnoreDirectives } from '../../../core/ignore/parse-ignore-directives'
import { collectCandidates } from '../../../core/generate/collect-candidates'
import { createIgnoreRules } from '../../../core/ignore/create-ignore-rules'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Settings of one collection run.
 */
interface CollectSetup {
  /**
   * Whether mutants that only a timeout can kill are kept.
   */
  timeouts?: boolean
}

/**
 * Collection of a snippet with the contexts the mutators received.
 */
type Collection = ReturnType<typeof collectCandidates> & {
  contexts: MutatorContext[]
}

/**
 * Ids that ignore directives of the snippets may list.
 */
let knownMutatorIds = new Set(['second', 'first', 'other'])

/**
 * Collects the candidates of a snippet, with the ignore rules of its comments.
 *
 * @param lines - Source lines, joined with line feeds.
 * @param mutators - Active mutators in rank order.
 * @param setup - Preset settings of the run.
 * @returns Candidates, diagnostics and the contexts the mutators received.
 */
function collect(
  lines: string[],
  mutators: ActiveMutator[],
  setup: CollectSetup = {},
): Collection {
  let { sourceCode, parsed, syntax, hints, tree } = createTestFile(
    lines.join('\n'),
  )
  let { directives } = parseIgnoreDirectives(parsed, knownMutatorIds)
  let { rules } = createIgnoreRules(parsed, directives)
  let contexts: MutatorContext[] = []
  let recorded = mutators.map(active => ({
    ...active,
    mutator: {
      ...active.mutator,
      create(context: MutatorContext) {
        contexts.push(context)
        return active.mutator.create(context)
      },
    },
  }))
  let result = collectCandidates({
    services: {
      settings: Object.freeze({
        timeouts: setup.timeouts ?? false,
        coarseMutants: false,
      }),
      isEnabled: () => true,
      isActive: () => true,
      sourceCode,
      syntax,
      hints,
    },
    mutators: recorded,
    parsed,
    rules,
    tree,
  })
  return { ...result, contexts }
}

/**
 * Turns a mutator on with empty options.
 *
 * @param id - Id of the mutator.
 * @param rank - Rank of the mutator.
 * @param create - Creates the visitors of the mutator.
 * @returns Active mutator.
 */
function activate(
  id: string,
  rank: number,
  create: Mutator['create'],
): ActiveMutator {
  return {
    mutator: { meta: { description: 'Test.' }, create },
    options: Object.freeze({}),
    rank,
    id,
  }
}

/**
 * Creates visitors that record the text of every identifier they receive.
 *
 * @param visits - List the visits are appended to.
 * @param id - Id of the mutator, written before each text.
 * @returns The `create` function of a mutator.
 */
function recordIdentifiers(visits: string[], id: string): Mutator['create'] {
  return context => ({
    Identifier(node) {
      visits.push(`${id} ${context.sourceCode.getText(node)}`)
      return []
    },
  })
}

describe('collectCandidates', () => {
  it('dispatches nodes in pre-order to the mutators in rank order', () => {
    let visits: string[] = []

    collect(
      ['a + b'],
      [
        activate('first', 0, recordIdentifiers(visits, 'first')),
        activate('second', 1, recordIdentifiers(visits, 'second')),
      ],
    )

    expect(visits).toStrictEqual(['first a', 'second a', 'first b', 'second b'])
  })

  it('passes the parent through parentheses', () => {
    let parents: (undefined | string)[] = []

    collect(
      ['((a))'],
      [
        activate('first', 0, () => ({
          Identifier(_node, parent) {
            parents.push(parent?.type)
            return []
          },
        })),
      ],
    )

    expect(parents).toStrictEqual(['ExpressionStatement'])
  })

  it('gives each mutator its id, options and the shared services', () => {
    let options = Object.freeze({ deep: true })
    let { contexts } = collect(
      ['a'],
      [{ ...activate('first', 0, () => ({})), options }],
      { timeouts: true },
    )
    let [context] = contexts

    expect(context).toMatchObject({
      settings: { timeouts: true },
      file: 'example.ts',
      id: 'first',
      options,
    })
    expect(context!.isActive('first', context!.sourceCode.program)).toBe(true)
    expect(context!.isEnabled('first')).toBe(true)
    expect(context!.hints.getType).toBeTypeOf('function')
    expect(context!.syntax.isLoopTest).toBeTypeOf('function')
  })

  it('turns replacements into candidates in emission order', () => {
    let { candidates } = collect(
      ['function f() {', '  return 1', '}'],
      [
        activate('first', 0, () => ({
          ReturnStatement(node) {
            return [
              { solitary: [node, node.argument!], text: '', node },
              { solitary: [], text: ';', node },
            ]
          },
        })),
        activate('second', 1, () => ({
          Literal(node) {
            return [{ text: '2', node }]
          },
        })),
      ],
    )

    expect(
      candidates.map(({ registered, ...candidate }) => ({
        ...candidate,
        mutator: registered.id,
      })),
    ).toStrictEqual([
      {
        solitary: [
          { start: 17, end: 25 },
          { start: 24, end: 25 },
        ],
        ignoreRule: null,
        mutator: 'first',
        kind: 'block',
        emission: 0,
        scope: 'f',
        start: 17,
        text: '',
        end: 25,
      },
      {
        ignoreRule: null,
        mutator: 'first',
        solitary: null,
        kind: 'block',
        emission: 1,
        scope: 'f',
        start: 17,
        text: ';',
        end: 25,
      },
      {
        kind: 'expression',
        mutator: 'second',
        ignoreRule: null,
        solitary: null,
        emission: 2,
        scope: 'f',
        start: 24,
        text: '2',
        end: 25,
      },
    ])
  })

  it.each([
    {
      directive: '// mootant-ignore-next-line first: kept apart',
      rule: 'next-line',
    },
    { directive: '// mootant-ignore-next-line other', rule: null },
    { directive: '// mootant-ignore-file', rule: 'file' },
  ])(
    'finds the ignore rule of a candidate under $directive',
    ({ directive, rule }) => {
      let { candidates } = collect(
        [directive, 'x = 1'],
        [
          activate('first', 0, () => ({
            Literal(node) {
              return [{ text: '2', node }]
            },
          })),
        ],
      )

      expect(candidates[0]!.ignoreRule?.kind ?? null).toBe(rule)
    },
  )

  it.each([
    { timeouts: false, count: 0 },
    { timeouts: true, count: 1 },
  ])(
    'keeps a replaced loop-advance value only with timeouts $timeouts',
    ({ timeouts, count }) => {
      let { candidates } = collect(
        ['while (!done) {', '  done = check()', '}'],
        [
          activate('first', 0, () => ({
            CallExpression(node) {
              return [{ text: 'true', node }]
            },
          })),
        ],
        { timeouts },
      )

      expect(candidates).toHaveLength(count)
    },
  )

  it('reports a throwing create and runs the other mutators', () => {
    let { diagnostics, candidates } = collect(
      ['x = 1'],
      [
        activate('first', 0, () => {
          throw new Error('Broken.')
        }),
        activate('second', 1, () => ({
          Literal(node) {
            return [{ text: '2', node }]
          },
        })),
      ],
    )

    expect(diagnostics).toStrictEqual([
      {
        message: 'Mutator "first" failed while preparing the file: Broken.',
        code: 'mutator-error',
        file: 'example.ts',
        severity: 'error',
        column: null,
        line: null,
      },
    ])
    expect(candidates).toHaveLength(1)
  })

  it('reports a throwing visitor at the visited node and goes on', () => {
    let { diagnostics, candidates } = collect(
      ['f(1)', 'g(b)'],
      [
        activate('first', 0, context => ({
          Identifier(node) {
            return [{ text: context.sourceCode.getText(node), node }]
          },
          Literal() {
            throw new Error('Bad literal.')
          },
        })),
      ],
    )

    expect(diagnostics).toStrictEqual([
      {
        message: 'Mutator "first" failed on Literal: Bad literal.',
        code: 'mutator-error',
        file: 'example.ts',
        severity: 'error',
        column: 3,
        line: 1,
      },
    ])
    expect(candidates.map(candidate => candidate.text)).toStrictEqual([
      'f',
      'g',
      'b',
    ])
  })

  it('drops only the invalid replacement of a visit', () => {
    let { diagnostics, candidates } = collect(
      ['let x = 1', 'x = a + b'],
      [
        activate('first', 0, context => ({
          BinaryExpression(node) {
            let [declaration] = context.sourceCode.program.body
            return [
              { node: declaration as Node, text: '' },
              { text: 'a - b', node },
            ]
          },
        })),
      ],
    )

    expect(diagnostics).toStrictEqual([
      {
        message:
          'Mutator "first" cannot replace a VariableDeclaration node; replace an expression or a statement.',
        code: 'mutator-error',
        file: 'example.ts',
        severity: 'error',
        column: 5,
        line: 2,
      },
    ])
    expect(candidates.map(candidate => candidate.text)).toStrictEqual(['a - b'])
  })
})
