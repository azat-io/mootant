import { describe, expect, it } from 'vitest'

import type { RegisteredMutator } from '../../../types/mutator/registered-mutator'
import type { MutantCandidate } from '../../../types/mutant/mutant-candidate'
import type { ParsedFile } from '../../../types/source/parsed-file'

import { assignMutantIds } from '../../../core/identity/assign-mutant-ids'
import { createMutantId } from '../../../core/identity/create-mutant-id'
import { getScopePath } from '../../../core/identity/get-scope-path'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Mutator that swaps `+` for `-`.
 */
const ARITHMETIC: RegisteredMutator = {
  mutator: { meta: { description: 'Arithmetic.' }, create: () => ({}) },
  id: 'arithmetic-operator',
  rank: 0,
}

/**
 * Mutator that produces the same replacements under another id.
 */
const DUPLICATE: RegisteredMutator = {
  mutator: { meta: { description: 'Duplicate.' }, create: () => ({}) },
  id: 'acme/no-plus',
  rank: 1,
}

/**
 * Candidates of a snippet with the file they belong to.
 */
interface SnippetCandidates {
  /**
   * One candidate per `+` expression, in canonical order.
   */
  candidates: MutantCandidate[]

  /**
   * Parsed snippet.
   */
  parsed: ParsedFile
}

/**
 * Parses a snippet and turns every `+` expression into a candidate that swaps
 * the operator, for each given mutator.
 *
 * @param lines - Source lines, joined with line feeds unless the text has its
 *   own line breaks.
 * @param file - Display path of the snippet.
 * @param mutators - Mutators that each emit the swap.
 * @returns Candidates in canonical order and the parsed file.
 */
function createCandidates(
  lines: string[],
  file: string = 'src/math.ts',
  mutators: RegisteredMutator[] = [ARITHMETIC],
): SnippetCandidates {
  let { parsed, tree } = createTestFile(lines.join('\n'), file)
  let candidates: MutantCandidate[] = []
  for (let node of tree.order) {
    if (node.type !== 'BinaryExpression' || node.operator !== '+') {
      continue
    }
    let scope = getScopePath(tree, node)
    for (let registered of mutators) {
      candidates.push({
        text: parsed.text.slice(node.start, node.end).replace('+', '-'),
        emission: candidates.length,
        kind: 'expression',
        start: node.start,
        ignoreRule: null,
        solitary: null,
        end: node.end,
        registered,
        scope,
      })
    }
  }
  return { candidates, parsed }
}

/**
 * Lists the ids of the candidates of a snippet in canonical order.
 *
 * @param lines - Source lines.
 * @param file - Display path of the snippet.
 * @param mutators - Mutators that each emit the swap.
 * @returns Ids in canonical order.
 */
function listIds(
  lines: string[],
  file?: string,
  mutators?: RegisteredMutator[],
): string[] {
  let { candidates, parsed } = createCandidates(lines, file, mutators)
  let ids = assignMutantIds(candidates, parsed.file, parsed.text)
  return candidates.map(candidate => ids.get(candidate)!)
}

/**
 * Function `add` of the test vectors.
 */
const ADD = ['export function add(a, b) {', '  return a + b', '}']

describe('assignMutantIds', () => {
  it('reproduces the test vector of a mutant in a function', () => {
    // spell-checker: disable-next-line
    expect(listIds(ADD)).toStrictEqual(['rxef04cnhtr7'])
  })

  it('reproduces the test vector of a mutant at the top level', () => {
    expect(listIds(['if (ready) { use(a + b) }'])).toStrictEqual([
      // spell-checker: disable-next-line
      '1vwgk50wbfh2',
    ])
  })

  it('counts occurrences of the same mutant in one scope', () => {
    let ids = listIds([
      'export function add(a, b) {',
      '  return (a + b) * (a + b)',
      '}',
    ])

    expect(ids).toStrictEqual([
      // spell-checker: disable-next-line
      'rxef04cnhtr7',
      // spell-checker: disable-next-line
      'k9910akyremp',
    ])
  })

  it('counts occurrences per scope, mutator, original and replacement', () => {
    let { candidates, parsed } = createCandidates(
      [
        'function add(a, b) { return a + b }',
        'function sum(a, b) { return a + b + (a + b) }',
      ],
      'src/math.ts',
      [ARITHMETIC, DUPLICATE],
    )
    let ids = assignMutantIds(candidates, parsed.file, parsed.text)

    expect(
      candidates.map(candidate => [
        candidate.registered.id,
        candidate.scope,
        ids.get(candidate),
      ]),
    ).toStrictEqual([
      [
        'arithmetic-operator',
        'add',
        createMutantId({
          mutator: 'arithmetic-operator',
          replacement: 'a - b',
          path: 'src/math.ts',
          original: 'a + b',
          occurrence: 0,
          scope: 'add',
        }),
      ],
      [
        'acme/no-plus',
        'add',
        createMutantId({
          mutator: 'acme/no-plus',
          replacement: 'a - b',
          path: 'src/math.ts',
          original: 'a + b',
          occurrence: 0,
          scope: 'add',
        }),
      ],
      [
        'arithmetic-operator',
        'sum',
        createMutantId({
          replacement: 'a - b + (a + b)',
          mutator: 'arithmetic-operator',
          original: 'a + b + (a + b)',
          path: 'src/math.ts',
          occurrence: 0,
          scope: 'sum',
        }),
      ],
      [
        'acme/no-plus',
        'sum',
        createMutantId({
          replacement: 'a - b + (a + b)',
          original: 'a + b + (a + b)',
          mutator: 'acme/no-plus',
          path: 'src/math.ts',
          occurrence: 0,
          scope: 'sum',
        }),
      ],
      [
        'arithmetic-operator',
        'sum',
        createMutantId({
          mutator: 'arithmetic-operator',
          replacement: 'a - b',
          path: 'src/math.ts',
          original: 'a + b',
          occurrence: 0,
          scope: 'sum',
        }),
      ],
      [
        'acme/no-plus',
        'sum',
        createMutantId({
          mutator: 'acme/no-plus',
          replacement: 'a - b',
          path: 'src/math.ts',
          original: 'a + b',
          occurrence: 0,
          scope: 'sum',
        }),
      ],
      [
        'arithmetic-operator',
        'sum',
        createMutantId({
          mutator: 'arithmetic-operator',
          replacement: 'a - b',
          path: 'src/math.ts',
          original: 'a + b',
          occurrence: 1,
          scope: 'sum',
        }),
      ],
      [
        'acme/no-plus',
        'sum',
        createMutantId({
          mutator: 'acme/no-plus',
          replacement: 'a - b',
          path: 'src/math.ts',
          original: 'a + b',
          occurrence: 1,
          scope: 'sum',
        }),
      ],
    ])
  })

  it('hashes CRLF and CR line breaks as LF', () => {
    let lines = ['export function add(a, b) {', '  return a +', ' b', '}']

    expect(listIds([lines.join('\r\n')])).toStrictEqual([
      // spell-checker: disable-next-line
      'gyw0g2h844m3',
    ])
    expect(listIds([lines.join('\r')])).toStrictEqual(listIds(lines))
  })

  it('keeps whitespace inside the texts significant', () => {
    expect(
      listIds(['export function add(a, b) {', '  return a  + b', '}']),
    ).not.toStrictEqual(listIds(ADD))
  })

  it.each([
    {
      lines: [
        '// header',
        '',
        'export function add(a, b) {',
        '  return a + b',
        '}',
      ],
      name: 'lines inserted above',
    },
    {
      lines: ['export function add(a, b) {', '  return use(1), a + b', '}'],
      name: 'an edit earlier on the same line',
    },
    {
      lines: [
        'function sum(a, b) {',
        '  return a + b',
        '}',
        'export function add(a, b) {',
        '  return a + b',
        '}',
      ],
      name: 'an identical mutant in a new function above',
    },
    {
      lines: [
        'export function add(left, right) {',
        '  let a = left',
        '  let b = right',
        '  return a + b',
        '}',
      ],
      name: 'local variables declared around the mutant',
    },
  ])('keeps the id after $name', ({ lines }) => {
    expect(listIds(lines).at(-1)).toBe(listIds(ADD)[0])
  })

  it('keeps the ids around a renamed local variable', () => {
    let before = [
      'export function add(a, b) {',
      '  let total = a + b',
      '  use(total)',
      '  return 1 + 2',
      '}',
    ]
    let after = before.map(line => line.replaceAll('total', 'sum'))

    expect(listIds(after)).toStrictEqual(listIds(before))
  })

  it.each([
    {
      lines: ['export function plus(a, b) {', '  return a + b', '}'],
      name: 'the function is renamed',
      file: 'src/math.ts',
    },
    { name: 'the file is moved', file: 'src/lib/math.ts', lines: ADD },
  ])('changes the id when $name', ({ lines, file }) => {
    expect(listIds(lines, file)).not.toStrictEqual(listIds(ADD))
  })

  it('keeps the id of a mutant when another mutator duplicates it', () => {
    expect(listIds(ADD, 'src/math.ts', [DUPLICATE, ARITHMETIC])).toStrictEqual([
      // spell-checker: disable-next-line
      'mcx5328tes79',
      // spell-checker: disable-next-line
      'rxef04cnhtr7',
    ])
  })
})
