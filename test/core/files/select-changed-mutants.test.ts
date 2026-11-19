import { describe, expect, it } from 'vitest'

import type { SkippedMutant } from '../../../types/mutant/skipped-mutant'
import type { FileMutants } from '../../../types/mutant/file-mutants'
import type { Diagnostic } from '../../../types/mutant/diagnostic'

import { selectChangedMutants } from '../../../core/files/select-changed-mutants'
import { createMutant } from '../../helpers/create-mutant'

/**
 * Text of the file: four lines, the second one with a carriage return and a
 * line separator that git does not count as line breaks.
 */
const SOURCE = 'let a = 1\nlet b = "\r\u{2028}" + 2\nlet c = 3\nlet d = 4\n'

/**
 * Warning of the file.
 */
let warning: Diagnostic = {
  message: 'Unknown mutator.',
  code: 'malformed-directive',
  severity: 'warning',
  file: 'src/a.ts',
  column: 1,
  line: 1,
}

/**
 * Builds a listed file with mutants on the given ranges.
 *
 * @param absolute - Real absolute path.
 * @param source - Text of the file, or null.
 * @param ranges - Ranges of the mutants, by id.
 * @returns The file, with a mutant and a skipped candidate per range.
 */
function createFile(
  absolute: string,
  source: string | null,
  ranges: Record<string, [start: number, end: number]>,
): FileMutants {
  return {
    mutants: Object.entries(ranges).map(([id, [start, end]]) =>
      createMutant({ start, end, id }),
    ),
    skipped: Object.values(ranges).map(([start, end]) =>
      createSkipped(start, end),
    ),
    parsed: source !== null,
    diagnostics: [warning],
    file: 'src/a.ts',
    absolute,
    source,
  }
}

/**
 * Builds a skipped candidate on a range.
 *
 * @param start - Offset of its first character.
 * @param end - Offset after its last character.
 * @returns The candidate.
 */
function createSkipped(start: number, end: number): SkippedMutant {
  return {
    mutator: 'number-literal',
    category: 'equivalent',
    reason: 'same value',
    kind: 'expression',
    rule: 'duplicate',
    file: 'src/a.ts',
    replacement: '0',
    heuristic: false,
    by: null,
    start,
    end,
  }
}

/**
 * Finds the offset of a text in the file.
 *
 * @param text - Text to look for.
 * @returns Offset of its first occurrence.
 */
function offset(text: string): number {
  return SOURCE.indexOf(text)
}

describe('selectChangedMutants', () => {
  it('keeps the mutants and skipped candidates whose lines include a changed one', () => {
    let file = createFile('/repo/src/a.ts', SOURCE, {
      startsOnChanged: [offset('let c'), offset('let d') + 3],
      endsOnChanged: [offset('let a'), offset('let c') + 3],
      spansChanged: [offset('let a'), offset('let d')],
      afterLine: [offset('4'), offset('4') + 1],
      before: [offset('1'), offset('1') + 1],
      onLine: [offset('3'), offset('3') + 1],
    })

    let [selected] = selectChangedMutants(
      [file],
      new Map([['/repo/src/a.ts', new Set([3])]]),
      true,
    )

    expect(selected!.mutants.map(mutant => mutant.id)).toStrictEqual([
      'startsOnChanged',
      'endsOnChanged',
      'spansChanged',
      'onLine',
    ])
    expect(selected!.skipped.map(candidate => candidate.start)).toStrictEqual([
      offset('let c'),
      offset('let a'),
      offset('let a'),
      offset('3'),
    ])
    expect(selected!.diagnostics).toStrictEqual([warning])
  })

  it('keeps untracked and unreadable files whole, and drops unchanged files with their diagnostics', () => {
    let untracked = createFile('/repo/src/new.ts', SOURCE, { a: [0, 1] })
    let unreadable = createFile('/repo/src/gone.ts', null, {})
    let unchanged = createFile('/repo/src/same.ts', SOURCE, { b: [0, 1] })

    expect(
      selectChangedMutants(
        [untracked, unreadable, unchanged],
        new Map<string, ReadonlySet<number> | 'all'>([
          ['/repo/src/gone.ts', new Set([1])],
          ['/repo/src/new.ts', 'all'],
        ]),
        true,
      ),
    ).toStrictEqual([untracked, unreadable])
  })

  it('keeps the mutants that skipped candidates on changed lines are left to, on any line', () => {
    let file = createFile('/repo/src/a.ts', SOURCE, {
      onLine: [offset('3'), offset('3') + 1],
    })
    file.mutants.push(
      createMutant({ end: offset('1') + 1, start: offset('1'), id: 'named' }),
      createMutant({
        end: offset('4') + 1,
        mutator: 'condition',
        replacement: 'true',
        start: offset('4'),
        id: 'owner',
      }),
      createMutant({
        end: offset('4') + 1,
        mutator: 'condition',
        replacement: 'false',
        start: offset('4'),
        id: 'sibling',
      }),
      createMutant({
        mutator: 'number-literal',
        end: offset('4') + 1,
        start: offset('4'),
        id: 'otherMutator',
      }),
      createMutant({
        focus: { start: offset('let b'), end: offset('2') + 1, text: '' },
        list: { start: offset('let a'), end: offset('2') + 1 },
        mutator: 'array-element',
        start: offset('1') + 1,
        end: offset('2') + 1,
        kind: 'element',
        id: 'element',
      }),
      createMutant({
        end: offset('2') + 1,
        start: offset('2'),
        id: 'unselected',
      }),
    )
    file.skipped = [
      {
        ...createSkipped(offset('let b'), offset('let b') + 1),
        by: {
          mutator: 'arithmetic-operator',
          start: offset('2'),
          id: 'unselected',
        },
      },
      createSkipped(offset('let c'), offset('let c') + 1),
      {
        ...createSkipped(offset('let c'), offset('let c') + 1),
        by: { mutator: 'arithmetic-operator', start: offset('1'), id: 'named' },
      },
      {
        ...createSkipped(offset('3'), offset('3') + 1),
        by: { mutator: 'condition', start: offset('4'), id: null },
      },
      {
        ...createSkipped(offset('3'), offset('3') + 1),
        by: { mutator: 'array-element', start: offset('let b'), id: null },
      },
    ]

    let [selected] = selectChangedMutants(
      [file],
      new Map([['/repo/src/a.ts', new Set([3])]]),
      true,
    )

    expect(selected!.mutants.map(mutant => mutant.id)).toStrictEqual([
      'onLine',
      'named',
      'owner',
      'sibling',
      'element',
    ])
    expect(selected!.skipped).toStrictEqual(file.skipped.slice(1))
  })

  it('follows the skipped candidates a skip names, on any line, to the mutants they are left to', () => {
    let file = createFile('/repo/src/a.ts', SOURCE, {})
    file.mutants = [
      createMutant({
        end: offset('let a') + 1,
        start: offset('let a'),
        mutator: 'acme/flip',
        id: 'plugin',
      }),
      createMutant({
        end: offset('1') + 1,
        mutator: 'condition',
        start: offset('1'),
        id: 'unrelated',
      }),
      createMutant({ end: offset('2') + 1, start: offset('2'), id: 'element' }),
      createMutant({
        mutator: 'comparison-operator',
        end: offset('let d') + 1,
        start: offset('let d'),
        id: 'comparison',
      }),
    ]
    file.skipped = [
      {
        ...createSkipped(offset('1'), offset('1') + 1),
        by: { start: offset('let a'), mutator: 'acme/flip', id: 'plugin' },
        mutator: 'boolean-literal',
      },
      {
        ...createSkipped(offset('1') + 1, offset('2') + 1),
        by: {
          mutator: 'arithmetic-operator',
          start: offset('2'),
          id: 'element',
        },
        focus: { start: offset('let b'), end: offset('2') + 1, text: '' },
        mutator: 'array-element',
        kind: 'element',
      },
      {
        ...createSkipped(offset('3'), offset('3') + 1),
        by: { mutator: 'boolean-literal', start: offset('1'), id: null },
      },
      {
        ...createSkipped(offset('3'), offset('3') + 1),
        by: { mutator: 'array-element', start: offset('let b'), id: null },
      },
      {
        ...createSkipped(offset('3'), offset('3') + 1),
        by: { mutator: 'condition', start: offset('4'), id: null },
      },
      {
        ...createSkipped(offset('4'), offset('4') + 1),
        by: {
          mutator: 'comparison-operator',
          start: offset('let d'),
          id: null,
        },
        mutator: 'condition',
      },
      {
        ...createSkipped(offset('4'), offset('4') + 1),
        mutator: 'condition',
      },
      {
        ...createSkipped(offset('let d'), offset('let d') + 1),
        by: { mutator: 'condition', start: offset('4'), id: null },
        mutator: 'comparison-operator',
      },
    ]

    let [selected] = selectChangedMutants(
      [file],
      new Map([['/repo/src/a.ts', new Set([3])]]),
      false,
    )

    expect(selected!.mutants.map(mutant => mutant.id)).toStrictEqual([
      'plugin',
      'element',
      'comparison',
    ])
  })

  it('drops the skipped candidates unless they are listed', () => {
    let changed = createFile('/repo/src/a.ts', SOURCE, { a: [0, 1] })
    changed.skipped[0]!.by = { mutator: 'condition', start: 20, id: null }
    let untracked = createFile('/repo/src/new.ts', SOURCE, { b: [0, 1] })
    let unreadable = createFile('/repo/src/gone.ts', null, {})

    expect(
      selectChangedMutants(
        [changed, untracked, unreadable],
        new Map<string, ReadonlySet<number> | 'all'>([
          ['/repo/src/gone.ts', new Set([1])],
          ['/repo/src/a.ts', new Set([1])],
          ['/repo/src/new.ts', 'all'],
        ]),
        false,
      ),
    ).toStrictEqual([
      { ...changed, skipped: [] },
      { ...untracked, skipped: [] },
      unreadable,
    ])
  })
})
