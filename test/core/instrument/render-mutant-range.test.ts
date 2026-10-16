import { describe, expect, it } from 'vitest'

import { renderMutantRange } from '../../../core/instrument/render-mutant-range'
import { groupMutantRanges } from '../../../core/instrument/group-mutant-ranges'
import { createMutant } from '../../helpers/create-mutant'

/**
 * Site check of a mutant as rendered.
 *
 * @param id - Id of the mutant.
 * @returns Text of the check.
 */
function check(id: string): string {
  return `globalThis.__mootant?.hit("${id}")`
}

describe('renderMutantRange', () => {
  it('chains the mutants of an expression range', () => {
    let source = 'a < b'
    let [range] = groupMutantRanges([
      createMutant({ replacement: 'a <= b', start: 0, id: 'm1', end: 5 }),
      createMutant({ replacement: 'a > b', start: 0, id: 'm2', end: 5 }),
    ])

    expect(
      renderMutantRange(range!, source, { statementStarts: new Map() }),
    ).toBe(`(${check('m1')} ? (a <= b) : ${check('m2')} ? (a > b) : (a < b))`)
  })

  it('chains the mutants of a block range', () => {
    let source = 'run()'
    let [range] = groupMutantRanges([
      createMutant({ replacement: ';', kind: 'block', start: 0, end: 5 }),
      createMutant({
        replacement: 'go()',
        kind: 'block',
        start: 0,
        id: 'm2',
        end: 5,
      }),
    ])

    expect(
      renderMutantRange(range!, source, {
        statementStarts: new Map([[0, ';']]),
      }),
    ).toBe(
      `{ if (${check('m1')}) {;} else if (${check('m2')}) {go()} else {run()} }`,
    )
  })

  it('guards an expression at a statement start', () => {
    let [range] = groupMutantRanges([createMutant({ start: 0, end: 3 })])

    expect(
      renderMutantRange(range!, 'a++', {
        statementStarts: new Map([[0, ';']]),
      }),
    ).toBe(`;(${check('m1')} ? (x) : (a++))`)
  })

  it('writes the guard given for the statement start', () => {
    let [range] = groupMutantRanges([createMutant({ start: 0, end: 3 })])

    expect(
      renderMutantRange(range!, 'a++', {
        statementStarts: new Map([[0, '{}']]),
      }),
    ).toBe(`{}(${check('m1')} ? (x) : (a++))`)
  })

  it('hosts nested ranges in the original branch', () => {
    let source = 'a.trim().length === 0'
    let [range] = groupMutantRanges([
      createMutant({ replacement: 'true', id: 'outer', start: 0, end: 21 }),
      createMutant({ replacement: 'a', id: 'inner', start: 0, end: 8 }),
      createMutant({ replacement: '1', id: 'zero', start: 20, end: 21 }),
    ])

    expect(
      renderMutantRange(range!, source, {
        statementStarts: new Map([[0, ';']]),
      }),
    ).toBe(
      `;(${check('outer')} ? (true) : ((${check('inner')} ? (a) : (a.trim())).length === (${check('zero')} ? (1) : (0))))`,
    )
  })

  it('keeps the guard of an expression inside a block host', () => {
    let [range] = groupMutantRanges([
      createMutant({ replacement: ';', kind: 'block', start: 0, end: 3 }),
      createMutant({ replacement: 'a--', start: 0, id: 'm2', end: 3 }),
    ])

    expect(
      renderMutantRange(range!, 'a++', {
        statementStarts: new Map([[0, ';']]),
      }),
    ).toBe(
      `{ if (${check('m1')}) {;} else {;(${check('m2')} ? (a--) : (a++))} }`,
    )
  })

  it('builds the checks with the given function', () => {
    let [range] = groupMutantRanges([
      createMutant({ replacement: ';', kind: 'block', start: 0, end: 3 }),
      createMutant({ replacement: 'a--', start: 0, id: 'm2', end: 3 }),
    ])

    expect(
      renderMutantRange(range!, 'a++', {
        getCheck: id => `on(${id})`,
        statementStarts: new Map(),
      }),
    ).toBe('{ if (on(m1)) {;} else {(on(m2) ? (a--) : (a++))} }')
  })
})
