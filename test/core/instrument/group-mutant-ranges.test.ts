import { describe, expect, it } from 'vitest'

import type { MutantRange } from '../../../types/mutant/mutant-range'

import { groupMutantRanges } from '../../../core/instrument/group-mutant-ranges'
import { createMutant } from '../../helpers/create-mutant'

/**
 * Describes a forest of groups by kind, range, mutant ids and children.
 *
 * @param ranges - Groups to describe.
 * @returns Nested plain description.
 */
function describeRanges(ranges: MutantRange[]): unknown[] {
  return ranges.map(range => ({
    range: `${range.kind} ${range.start}-${range.end}`,
    mutants: range.mutants.map(mutant => mutant.id),
    children: describeRanges(range.children),
  }))
}

describe('groupMutantRanges', () => {
  it('groups mutants of one range in list order', () => {
    expect(
      describeRanges(
        groupMutantRanges([
          createMutant({ start: 4, id: 'b', end: 9 }),
          createMutant({ start: 0, id: 'a', end: 3 }),
          createMutant({ start: 4, id: 'c', end: 9 }),
        ]),
      ),
    ).toStrictEqual([
      { range: 'expression 0-3', mutants: ['a'], children: [] },
      { range: 'expression 4-9', mutants: ['b', 'c'], children: [] },
    ])
  })

  it('nests ranges, adjacent ones as siblings', () => {
    expect(
      describeRanges(
        groupMutantRanges([
          createMutant({ start: 3, id: 'c', end: 5 }),
          createMutant({ start: 0, end: 10, id: 'a' }),
          createMutant({ start: 0, id: 'b', end: 3 }),
          createMutant({ start: 3, id: 'd', end: 4 }),
        ]),
      ),
    ).toStrictEqual([
      {
        children: [
          { range: 'expression 0-3', mutants: ['b'], children: [] },
          {
            children: [
              { range: 'expression 3-4', mutants: ['d'], children: [] },
            ],
            range: 'expression 3-5',
            mutants: ['c'],
          },
        ],
        range: 'expression 0-10',
        mutants: ['a'],
      },
    ])
  })

  it('puts the expression group of a statement inside its block group', () => {
    expect(
      describeRanges(
        groupMutantRanges([
          createMutant({ start: 0, id: 'a', end: 5 }),
          createMutant({ kind: 'block', start: 0, id: 'b', end: 5 }),
        ]),
      ),
    ).toStrictEqual([
      {
        children: [{ range: 'expression 0-5', mutants: ['a'], children: [] }],
        range: 'block 0-5',
        mutants: ['b'],
      },
    ])
  })

  it('throws on overlapping ranges', () => {
    expect(() =>
      groupMutantRanges([
        createMutant({ start: 0, id: 'a', end: 5 }),
        createMutant({ start: 3, id: 'b', end: 8 }),
      ]),
    ).toThrow('Mutant ranges of example.ts overlap at 3.')
  })

  it('returns nothing without mutants', () => {
    expect(groupMutantRanges([])).toStrictEqual([])
  })
})
