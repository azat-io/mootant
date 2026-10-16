import type { VariableDeclaration, Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TemplateExpression } from '../../../types/source/template-expression'
import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { ActiveMutator } from '../../../types/mutator/active-mutator'
import type { Mutator } from '../../../types/mutator/mutator'

import { parseIgnoreDirectives } from '../../../core/ignore/parse-ignore-directives'
import { collectCandidates } from '../../../core/generate/collect-candidates'
import { createIgnoreRules } from '../../../core/ignore/create-ignore-rules'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Settings of one collection run.
 */
interface CollectSetup {
  /**
   * Template code the snippet stands for, if any.
   */
  expressions?: TemplateExpression[]

  /**
   * Whether mutants that only a timeout can kill are kept.
   */
  timeouts?: boolean

  /**
   * Whether skipped replacements are collected.
   */
  skipped?: boolean

  /**
   * Path of the snippet; `example.ts` when omitted.
   */
  file?: string
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
    setup.file,
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
        templates: true,
        loggers: [],
      }),
      isEnabled: () => true,
      isActive: () => true,
      sourceCode,
      syntax,
      hints,
    },
    expressions: setup.expressions ?? null,
    skipped: setup.skipped ?? false,
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

  it('skips a replacement in a timer delay unless it can unguard a read', () => {
    let { candidates, skipped } = collect(
      [
        'setTimeout(run, seconds * 1000)',
        'setTimeout(run, options?.delay)',
        'setTimeout(seconds * 1000)',
        'setTimeout(run, options && options.delay)',
        'setTimeout(run, options.delay * 2)',
      ],
      [
        activate('first', 0, context => ({
          BinaryExpression(node) {
            return [{ text: context.sourceCode.getText(node.left), node }]
          },
        })),
        activate('second', 1, context => ({
          LogicalExpression(node) {
            return [{ text: context.sourceCode.getText(node.right), node }]
          },
          ChainExpression(node) {
            return [{ text: 'options.delay', node }]
          },
        })),
      ],
      { skipped: true },
    )

    expect(
      candidates.map(candidate => [candidate.registered.id, candidate.text]),
    ).toStrictEqual([
      ['second', 'options.delay'],
      ['first', 'seconds'],
      ['second', 'options.delay'],
    ])
    expect(
      skipped.map(candidate => [
        candidate.registered.id,
        candidate.rule,
        candidate.text,
      ]),
    ).toStrictEqual([
      ['first', 'timer-delay', 'seconds'],
      ['first', 'timer-delay', 'options.delay'],
    ])
    expect(skipped[0]!.reason).toBe('a timer delay is not worth a test')
  })

  it('lists a replacement its visitor skipped in a timer delay as a timer delay', () => {
    let { skipped } = collect(
      ['let n: number = 1', 'setTimeout(run, 100)'],
      [
        activate('first', 0, context => ({
          Literal(node) {
            let [declaration] = context.sourceCode.program
              .body as VariableDeclaration[]
            let { typeAnnotation } = declaration!.declarations[0]!.id as {
              typeAnnotation: Node
            }
            let note = { reason: 'Own.', rule: 'O11' } as const
            return [
              { skip: note, text: '2', node },
              { node: typeAnnotation, text: 'string', skip: note },
            ]
          },
        })),
      ],
      { skipped: true },
    )

    expect(skipped.map(candidate => candidate.rule)).toStrictEqual([
      'O11',
      'O11',
      'timer-delay',
      'O11',
    ])
  })

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

  it.each([
    { skipped: false, count: 0 },
    { skipped: true, count: 1 },
  ])(
    'collects a skipped replacement only when asked ($skipped)',
    ({ skipped, count }) => {
      let result = collect(
        ['x = a + b'],
        [
          activate('first', 0, () => ({
            BinaryExpression(node) {
              return [
                { skip: { reason: 'Owned.', rule: 'O1' }, text: 'a', node },
                { text: 'a - b', node },
              ]
            },
          })),
        ],
        { skipped },
      )

      expect(result.candidates.map(candidate => candidate.emission)).toEqual([
        0,
      ])
      expect(result.skipped).toHaveLength(count)
    },
  )

  it('keeps the rule, reason and justifying mutant of a skipped replacement', () => {
    let { candidates, skipped } = collect(
      ['x = a + b'],
      [
        activate('first', 0, () => ({
          BinaryExpression(node) {
            return [
              {
                skip: {
                  by: { mutator: 'other', node: node.right },
                  reason: 'Owned.',
                  rule: 'O1',
                },
                text: 'a',
                node,
              },
              {
                skip: { reason: 'Noise.', heuristic: true, rule: 'O12' },
                text: 'b',
                node,
              },
            ]
          },
        })),
      ],
      { skipped: true },
    )

    expect(candidates).toStrictEqual([])
    expect(
      skipped.map(({ registered, ...candidate }) => ({
        ...candidate,
        mutator: registered.id,
      })),
    ).toStrictEqual([
      {
        by: { mutator: 'other', start: 8, id: null },
        kind: 'expression',
        mutator: 'first',
        reason: 'Owned.',
        heuristic: false,
        emission: 0,
        rule: 'O1',
        text: 'a',
        start: 4,
        end: 9,
      },
      {
        kind: 'expression',
        mutator: 'first',
        reason: 'Noise.',
        heuristic: true,
        rule: 'O12',
        emission: 1,
        text: 'b',
        by: null,
        start: 4,
        end: 9,
      },
    ])
  })

  it('lists an invalid replacement and a loop-advance value as skipped', () => {
    let { skipped } = collect(
      ['let x = 1', 'while (!done) {', '  done = check()', '}'],
      [
        activate('first', 0, context => ({
          CallExpression(node) {
            let [declaration] = context.sourceCode.program.body
            return [
              { node: declaration as Node, text: '' },
              { text: 'true', node },
            ]
          },
        })),
      ],
      { skipped: true },
    )

    expect(
      skipped.map(candidate => [candidate.rule, candidate.reason]),
    ).toStrictEqual([
      [
        'invalid-target',
        'the mutator cannot replace a VariableDeclaration node; replace an expression or a statement',
      ],
      [
        'loop-advance',
        'it changes the value that advances a loop, so only a timeout could kill it',
      ],
    ])
  })

  it('lists a replacement that would move a rune call as skipped', () => {
    let lines = [
      'class Box {',
      '  constructor() {',
      '    this.count = $state(0)',
      '    this.log = []',
      '  }',
      '}',
    ]
    let mutator = activate('first', 0, () => ({
      ExpressionStatement: node => [{ text: ';', node }],
    }))
    let { diagnostics, candidates, skipped } = collect(lines, [mutator], {
      file: 'box.svelte.js',
      skipped: true,
    })

    expect(candidates.map(candidate => candidate.start)).toStrictEqual([61])
    expect(diagnostics).toStrictEqual([])
    expect(
      skipped.map(candidate => [
        candidate.rule,
        candidate.start,
        candidate.reason,
      ]),
    ).toStrictEqual([
      [
        'compiler-macro',
        34,
        'it would move a Svelte rune call out of the place the compiler accepts it in',
      ],
    ])
    expect(
      collect(lines, [mutator], { file: 'box.js' }).candidates,
    ).toHaveLength(2)
  })

  it('fits replacements into the Vue template code around them', () => {
    let mutator = activate('first', 0, () => ({
      Identifier: node => [{ text: node.name === 'b' ? "`'`" : "''", node }],
    }))
    let { candidates, skipped } = collect(['f(a, b)'], [mutator], {
      expressions: [{ delimiter: "'", wrap: 'value', start: 2, end: 6 }],
      skipped: true,
    })

    expect(
      candidates.map(candidate => [candidate.start, candidate.text]),
    ).toStrictEqual([
      [0, "''"],
      [2, '""'],
    ])
    expect(
      skipped.map(candidate => [
        candidate.rule,
        candidate.start,
        candidate.reason,
      ]),
    ).toStrictEqual([
      ['template-text', 5, "it would write ', which ends the attribute value"],
    ])
  })
})
