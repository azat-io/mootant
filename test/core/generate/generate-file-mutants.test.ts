import { describe, expect, it } from 'vitest'

import type { ActiveMutator } from '../../../types/active-mutator'
import type { FileMutants } from '../../../types/file-mutants'
import type { Mutator } from '../../../types/mutator'

import { generateFileMutants } from '../../../core/generate/generate-file-mutants'
import { createMutantId } from '../../../core/identity/create-mutant-id'

/**
 * Ids that ignore directives of the snippets may list.
 */
let knownMutatorIds = new Set([
  'arithmetic',
  'skipper',
  'removal',
  'probe',
  'copy',
  'same',
])

/**
 * Swaps `+` for `-`.
 */
const ARITHMETIC: Mutator = {
  create: context => ({
    BinaryExpression(node) {
      return [{ text: context.sourceCode.replaceOperator(node, '-'), node }]
    },
  }),
  meta: { description: 'Arithmetic.' },
}

/**
 * Removes expression statements as coarse mutants.
 */
const REMOVAL: Mutator = {
  create: () => ({
    ExpressionStatement(node) {
      return [{ solitary: [node], text: '', node }]
    },
  }),
  meta: { description: 'Removal.' },
}

/**
 * Returns every literal unchanged.
 */
const SAME: Mutator = {
  create: context => ({
    Literal(node) {
      return [{ text: context.sourceCode.getText(node), node }]
    },
  }),
  meta: { description: 'Same.' },
}

/**
 * Skips the drop of the right operand of every `+`, in favor of the swap.
 */
const SKIPPER: Mutator = {
  create: context => ({
    BinaryExpression(node) {
      return [
        {
          skip: {
            by: { mutator: 'arithmetic', node },
            reason: 'the swap covers it',
            heuristic: true,
            rule: 'O11',
          },
          text: context.sourceCode.getText(node.left),
          node,
        },
      ]
    },
  }),
  meta: { description: 'Skipper.' },
}

/**
 * Generates the mutants of a snippet without timeouts.
 *
 * @param lines - Source lines, joined with line feeds.
 * @param mutators - Active mutators in rank order.
 * @param setup - Whether the run keeps coarse mutants and lists skipped
 *   candidates; neither when omitted.
 * @returns Result of the file.
 */
function generate(
  lines: string[],
  mutators: ActiveMutator[],
  setup: { coarseMutants?: boolean; skipped?: boolean } = {},
): FileMutants {
  return generateFileMutants({
    settings: Object.freeze({
      coarseMutants: setup.coarseMutants ?? false,
      timeouts: false,
    }),
    skipped: setup.skipped ?? false,
    source: lines.join('\n'),
    file: 'src/example.ts',
    knownMutatorIds,
    mutators,
  })
}

/**
 * Generates the `arithmetic` mutants of a component file.
 *
 * @param lines - Lines of the component, joined with line feeds.
 * @param file - Display path of the component.
 * @returns Result of the file.
 */
function generateComponent(lines: string[], file: string): FileMutants {
  return generateFileMutants({
    settings: Object.freeze({ coarseMutants: false, timeouts: false }),
    mutators: [activate('arithmetic', 0, ARITHMETIC)],
    source: lines.join('\n'),
    knownMutatorIds,
    file,
  })
}

/**
 * Turns a mutator on with empty options.
 *
 * @param id - Id of the mutator.
 * @param rank - Rank of the mutator.
 * @param mutator - Module of the mutator.
 * @returns Active mutator.
 */
function activate(id: string, rank: number, mutator: Mutator): ActiveMutator {
  return { options: Object.freeze({}), mutator, rank, id }
}

describe('generateFileMutants', () => {
  it('returns the parse errors of a file that does not parse', () => {
    let result = generate(
      ['let x = ;'],
      [activate('arithmetic', 0, ARITHMETIC)],
    )

    expect(result).toMatchObject({
      file: 'src/example.ts',
      source: 'let x = ;',
      parsed: false,
      mutants: [],
    })
    expect(result.diagnostics[0]).toMatchObject({
      code: 'parse-error',
      severity: 'error',
    })
  })

  it('lists the mutants of every mutator in canonical order', () => {
    let result = generate(
      ['function add(a: number, b: number) {', '  return a + b', '}', 'x = 1'],
      [
        activate('arithmetic', 0, ARITHMETIC),
        activate('removal', 1, REMOVAL),
        activate('same', 2, SAME),
      ],
    )

    expect(result).toStrictEqual({
      mutants: [
        {
          id: createMutantId({
            path: 'src/example.ts',
            mutator: 'arithmetic',
            replacement: 'a - b',
            original: 'a + b',
            occurrence: 0,
            scope: 'add',
          }),
          file: 'src/example.ts',
          mutator: 'arithmetic',
          replacement: 'a - b',
          kind: 'expression',
          status: 'Pending',
          ignoredBy: null,
          reason: null,
          scope: 'add',
          start: 46,
          end: 51,
        },
        {
          id: createMutantId({
            path: 'src/example.ts',
            mutator: 'removal',
            original: 'x = 1',
            replacement: '',
            occurrence: 0,
            scope: '',
          }),
          file: 'src/example.ts',
          mutator: 'removal',
          status: 'Pending',
          replacement: '',
          ignoredBy: null,
          kind: 'block',
          reason: null,
          scope: null,
          start: 54,
          end: 59,
        },
      ],
      source: [
        'function add(a: number, b: number) {',
        '  return a + b',
        '}',
        'x = 1',
      ].join('\n'),
      file: 'src/example.ts',
      diagnostics: [],
      parsed: true,
      skipped: [],
    })
  })

  it('answers isEnabled and isActive with the ignore directives of the file', () => {
    let answers: string[] = []
    let probe: Mutator = {
      create: context => ({
        BinaryExpression(node) {
          answers.push(
            [
              context.sourceCode.getText(node),
              context.isActive('arithmetic', node),
              context.isActive('copy', node),
              context.isEnabled('arithmetic'),
              context.isEnabled('copy'),
            ].join(' '),
          )
          return []
        },
      }),
      meta: { description: 'Probe.' },
    }

    generate(
      [
        '// mootant-ignore-next-line arithmetic',
        'x = a + b',
        '// mootant-ignore-start',
        'x = c + d',
        '// mootant-ignore-end',
        'x = e + f',
      ],
      [activate('arithmetic', 0, ARITHMETIC), activate('probe', 1, probe)],
    )
    generate(
      ['x = g + h', '// mootant-ignore-file arithmetic'],
      [activate('arithmetic', 0, ARITHMETIC), activate('probe', 1, probe)],
    )

    expect(answers).toStrictEqual([
      'a + b false false true false',
      'c + d false false true false',
      'e + f true false true false',
      'g + h false false true false',
    ])
  })

  it('assigns ids before duplicates are dropped', () => {
    let lines = ['x = a + b']
    let alone = generate(lines, [activate('arithmetic', 1, ARITHMETIC)])
    let duplicated = generate(lines, [
      activate('copy', 0, ARITHMETIC),
      activate('arithmetic', 1, ARITHMETIC),
    ])

    expect(duplicated.mutants.map(mutant => mutant.mutator)).toStrictEqual([
      'copy',
    ])

    let copied = generate(lines, [
      activate('arithmetic', 1, ARITHMETIC),
      activate('copy', 2, ARITHMETIC),
    ])

    expect(copied.mutants).toStrictEqual(alone.mutants)
  })

  it.each([
    {
      name: 'drops a coarse mutant that holds a finer pending one',
      expected: ['arithmetic'],
      coarseMutants: false,
    },
    {
      name: 'keeps a coarse mutant that holds a finer one with coarse mutants on',
      expected: ['arithmetic', 'removal'],
      coarseMutants: true,
    },
  ])('$name', ({ coarseMutants, expected }) => {
    let result = generate(
      ['total = a + b'],
      [activate('arithmetic', 0, ARITHMETIC), activate('removal', 1, REMOVAL)],
      { coarseMutants },
    )

    expect(
      result.mutants.map(mutant => mutant.mutator).toSorted(),
    ).toStrictEqual(expected)
  })

  it('surfaces a coarse mutant with its usual id when its finer one is ignored', () => {
    let lines = [
      '// mootant-ignore-next-line arithmetic: checked elsewhere',
      'total = a + b',
    ]
    let result = generate(lines, [
      activate('arithmetic', 0, ARITHMETIC),
      activate('removal', 1, REMOVAL),
    ])
    let removalOnly = generate(lines, [activate('removal', 1, REMOVAL)])

    expect(result.mutants).toMatchObject([
      { mutator: 'removal', status: 'Pending', ignoredBy: null, reason: null },
      {
        ignoredBy: {
          directive: 'mootant-ignore-next-line',
          column: 1,
          line: 1,
        },
        reason: 'checked elsewhere',
        mutator: 'arithmetic',
        status: 'Ignored',
      },
    ])
    expect(result.mutants[0]!.id).toBe(removalOnly.mutants[0]!.id)
  })

  it('returns mutator errors, then directive and region warnings', () => {
    let broken: Mutator = {
      create: () => {
        throw new Error('Broken.')
      },
      meta: { description: 'Broken.' },
    }

    let result = generate(
      ['// mootant-ignore-next-line typo', 'x = 1', '// mootant-ignore-end'],
      [activate('probe', 0, broken)],
    )

    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual(
      ['mutator-error', 'unknown-mutator', 'unmatched-ignore-end'],
    )
  })

  it('merges the mutants of every script block with one id numbering per file', () => {
    let result = generateComponent(
      [
        '<template><p>{{ a + b }}</p></template>',
        '<script>x = a + b</script>',
        '<script setup lang="ts">',
        'x = a + b',
        '</script>',
      ],
      'src/App.vue',
    )

    expect(
      result.mutants.map(mutant => [
        mutant.start,
        mutant.replacement,
        mutant.id,
      ]),
    ).toStrictEqual(
      [
        [52, 0],
        [96, 1],
      ].map(([start, occurrence]) => [
        start,
        'a - b',
        createMutantId({
          occurrence: occurrence!,
          mutator: 'arithmetic',
          replacement: 'a - b',
          path: 'src/App.vue',
          original: 'a + b',
          scope: '',
        }),
      ]),
    )
    expect(result).toMatchObject({ diagnostics: [], parsed: true })
  })

  it('applies a file directive of any block to every block', () => {
    let result = generateComponent(
      [
        '---',
        'x = a + b',
        '---',
        '<script>',
        '// mootant-ignore-file arithmetic',
        'y = c + d',
        '</script>',
        '<script>',
        '// mootant-ignore-next-line',
        'z = e + f',
        '</script>',
      ],
      'src/index.astro',
    )

    expect(
      result.mutants.map(mutant => [
        mutant.replacement,
        mutant.ignoredBy?.directive,
      ]),
    ).toStrictEqual([
      ['a - b', 'mootant-ignore-file'],
      ['c - d', 'mootant-ignore-file'],
      ['e - f', 'mootant-ignore-next-line'],
    ])
  })

  it('reports a block that fails to parse and mutates the others', () => {
    let result = generateComponent(
      [
        '<script context="module">let a = (</script>',
        '<p>{a + b}</p>',
        '<script>',
        'x = c + d',
        '// mootant-ignore-end',
        '</script>',
      ],
      'src/Card.svelte',
    )

    expect(result.mutants.map(mutant => mutant.replacement)).toStrictEqual([
      'c - d',
    ])
    expect(result.parsed).toBe(true)
    expect(
      result.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.line]),
    ).toStrictEqual([
      ['parse-error', 1],
      ['unmatched-ignore-end', 5],
    ])
  })

  it.each([
    {
      lines: ['<script>let a = (</script>', '<script>let b = )</script>'],
      name: 'is not parsed when every block fails',
      parseErrors: 2,
      parsed: false,
    },
    {
      name: 'is parsed without mutants when it has no block',
      lines: ['<template><p>{{ a + b }}</p></template>'],
      parseErrors: 0,
      parsed: true,
    },
  ])('a component $name', ({ parseErrors, parsed, lines }) => {
    let result = generateComponent(lines, 'src/App.vue')

    expect(result).toMatchObject({ mutants: [], parsed })
    expect(result.diagnostics).toHaveLength(parseErrors)
  })

  it('lists skipped candidates in canonical order with their rules', () => {
    let lines = ['total = a + b']
    let mutators = [
      activate('arithmetic', 0, ARITHMETIC),
      activate('copy', 1, ARITHMETIC),
      activate('removal', 2, REMOVAL),
      activate('skipper', 3, SKIPPER),
    ]
    let result = generate(lines, mutators, { skipped: true })
    let arithmeticId = result.mutants[0]!.id

    expect(result.mutants.map(mutant => mutant.mutator)).toStrictEqual([
      'arithmetic',
    ])
    expect(result.skipped).toStrictEqual([
      {
        reason:
          'a finer arithmetic mutant lies inside the code it removes, and killing that mutant needs a test that observes this code',
        by: { mutator: 'arithmetic', id: arithmeticId, start: 8 },
        file: 'src/example.ts',
        category: 'subsumed',
        mutator: 'removal',
        rule: 'solitary',
        heuristic: true,
        replacement: '',
        kind: 'block',
        start: 0,
        end: 13,
      },
      {
        reason:
          'it produces the same mutated file as an earlier arithmetic mutant',
        by: { mutator: 'arithmetic', id: arithmeticId, start: 8 },
        file: 'src/example.ts',
        category: 'duplicate',
        replacement: 'a - b',
        kind: 'expression',
        rule: 'duplicate',
        heuristic: false,
        mutator: 'copy',
        start: 8,
        end: 13,
      },
      {
        by: { mutator: 'arithmetic', start: 8, id: null },
        reason: 'the swap covers it',
        file: 'src/example.ts',
        mutator: 'skipper',
        kind: 'expression',
        category: 'owned',
        replacement: 'a',
        heuristic: true,
        rule: 'O11',
        start: 8,
        end: 13,
      },
    ])
  })

  it('names no id for a justifying candidate that is not listed', () => {
    let probe: Mutator = {
      create: () => ({
        Identifier(node) {
          return node.name === 'c' ? [{ text: 'd', node }] : []
        },
        BlockStatement(node) {
          return [{ text: '{ f(d) }', node }]
        },
      }),
      meta: { description: 'Probe.' },
    }
    let result = generate(
      ['{ f(c) }'],
      [activate('probe', 0, probe), activate('removal', 1, REMOVAL)],
      { skipped: true },
    )

    expect(
      result.skipped.map(candidate => [candidate.rule, candidate.by]),
    ).toStrictEqual([
      ['solitary', { mutator: 'probe', start: 4, id: null }],
      ['duplicate', { id: result.mutants[0]!.id, mutator: 'probe', start: 0 }],
    ])
  })

  it.each([false, true])(
    'keeps the mutants and their ids when skipped candidates are listed (coarse mutants %s)',
    coarseMutants => {
      let lines = ['total = a + b', 'x = c + d']
      let mutators = [
        activate('arithmetic', 0, ARITHMETIC),
        activate('copy', 1, ARITHMETIC),
        activate('removal', 2, REMOVAL),
        activate('skipper', 3, SKIPPER),
      ]

      expect(
        generate(lines, mutators, { skipped: true, coarseMutants }).mutants,
      ).toStrictEqual(generate(lines, mutators, { coarseMutants }).mutants)
    },
  )

  it('does not list a skipped no-op', () => {
    let noOp: Mutator = {
      create: context => ({
        Literal(node) {
          return [
            {
              skip: { reason: 'the literal mutator owns it', rule: 'O7' },
              text: context.sourceCode.getText(node),
              node,
            },
          ]
        },
      }),
      meta: { description: 'No-op.' },
    }

    expect(
      generate(['x = 1'], [activate('probe', 0, noOp)], { skipped: true })
        .skipped,
    ).toStrictEqual([])
  })
})
