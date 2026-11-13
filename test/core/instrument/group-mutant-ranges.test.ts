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

  it('groups the removals of one literal by the literal', () => {
    let list = { start: 0, end: 6 }
    expect(
      describeRanges(
        groupMutantRanges([
          createMutant({
            focus: { text: '', start: 1, end: 2 },
            replacement: '',
            kind: 'element',
            start: 1,
            id: 'a',
            end: 4,
            list,
          }),
          createMutant({
            focus: { text: '', start: 4, end: 5 },
            replacement: '',
            kind: 'element',
            start: 2,
            id: 'b',
            end: 5,
            list,
          }),
          createMutant({ start: 4, id: 'c', end: 5 }),
          createMutant({ start: 0, id: 'd', end: 6 }),
        ]),
      ),
    ).toStrictEqual([
      {
        children: [
          {
            children: [
              { range: 'expression 4-5', mutants: ['c'], children: [] },
            ],
            range: 'expression 0-6',
            mutants: ['d'],
          },
        ],
        range: 'element 0-6',
        mutants: ['a', 'b'],
      },
    ])
  })

  it('nests the removals of a literal between a block and an expression of the same range', () => {
    expect(
      describeRanges(
        groupMutantRanges([
          createMutant({ start: 0, id: 'a', end: 8 }),
          createMutant({
            focus: { start: 2, text: '', end: 6 },
            list: { start: 0, end: 8 },
            kind: 'property',
            replacement: '',
            start: 2,
            id: 'b',
            end: 6,
          }),
          createMutant({ kind: 'block', start: 0, id: 'c', end: 8 }),
        ]),
      ),
    ).toStrictEqual([
      {
        children: [
          {
            children: [
              { range: 'expression 0-8', mutants: ['a'], children: [] },
            ],
            range: 'property 0-8',
            mutants: ['b'],
          },
        ],
        range: 'block 0-8',
        mutants: ['c'],
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
