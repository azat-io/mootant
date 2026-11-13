import { describe, expect, it } from 'vitest'

import { renderMutantRange } from '../../../core/instrument/render-mutant-range'
import { groupMutantRanges } from '../../../core/instrument/group-mutant-ranges'
import { getSiteSyntax } from '../../../core/instrument/get-site-syntax'
import { createMutant } from '../../helpers/create-mutant'

/**
 * Runtime of script code as rendered.
 */
const RUNTIME = 'globalThis.__mootant'

/**
 * Check in the copy of a literal that a removal is active, as rendered.
 *
 * @param id - Id of the removal.
 * @returns Text of the check.
 */
function active(id: string): string {
  return `${RUNTIME}.active === "${id}"`
}

/**
 * Site check of a mutant as rendered.
 *
 * @param id - Id of the mutant.
 * @returns Text of the check.
 */
function check(id: string): string {
  return `${RUNTIME}?.hit("${id}")`
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

  it('puts 0 after a ( that would come right before a regular expression that starts with <!--', () => {
    let source = 'if (/<!--x/.test(s), ok) f(/<!--x/g, /x/g, a ?? b ?? 1)'
    let ranges = groupMutantRanges([
      createMutant({ replacement: 'false', start: 4, end: 23 }),
      createMutant({ replacement: '/<!--y/g', start: 27, id: 'm2', end: 35 }),
      createMutant({ replacement: '/x/', start: 37, id: 'm3', end: 41 }),
      createMutant({
        replacement: '(/<!--x/.exec(s) ?? b) || 1',
        start: 43,
        id: 'm4',
        end: 54,
      }),
    ])

    expect(
      ranges.map(range =>
        renderMutantRange(range, source, { statementStarts: new Map() }),
      ),
    ).toStrictEqual([
      `(${check('m1')} ? (false) : (0, /<!--x/.test(s), ok))`,
      `(${check('m2')} ? (0, /<!--y/g) : (0, /<!--x/g))`,
      `(${check('m3')} ? (/x/) : (/x/g))`,
      `(${check('m4')} ? ((0, /<!--x/.exec(s) ?? b) || 1) : (a ?? b ?? 1))`,
    ])
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

  it('hosts the removals of an array around it with a copy that cuts the active element', () => {
    let source = '[a, (b), ...c]'
    let list = { start: 0, end: 14 }
    let [range] = groupMutantRanges([
      createMutant({
        focus: { text: '', start: 1, end: 2 },
        replacement: '',
        kind: 'element',
        id: 'first',
        start: 1,
        end: 4,
        list,
      }),
      createMutant({
        focus: { text: '', start: 4, end: 7 },
        replacement: '',
        kind: 'element',
        id: 'second',
        start: 4,
        end: 9,
        list,
      }),
      createMutant({
        focus: { text: '', start: 9, end: 13 },
        replacement: '',
        kind: 'element',
        id: 'third',
        start: 7,
        end: 13,
        list,
      }),
      createMutant({ replacement: 'd', id: 'name', start: 5, end: 6 }),
    ])

    expect(
      renderMutantRange(range!, source, {
        statementStarts: new Map([[0, ';']]),
      }),
    ).toBe(
      `;(${RUNTIME}?.hitAny(["first", "second", "third"]) ? ${RUNTIME}.cut([(${active('first')} ? ${RUNTIME}.gap : a), (${active('second')} ? ${RUNTIME}.gap : (b)), ...(${active('third')} ? ${RUNTIME}.none : c)]) : [a, ((${check('name')} ? (d) : (b))), ...c])`,
    )
  })

  it('hosts the removals of an object around it with a copy that spreads its members', () => {
    let source = '{ a: { b } }'
    let outer = { start: 0, end: 12 }
    let [range] = groupMutantRanges([
      createMutant({
        focus: { start: 2, text: '', end: 10 },
        kind: 'property',
        replacement: '',
        list: outer,
        start: 2,
        id: 'm1',
        end: 10,
      }),
      createMutant({
        focus: { start: 2, text: '', end: 10 },
        kind: 'property',
        replacement: '',
        list: outer,
        start: 2,
        id: 'm2',
        end: 10,
      }),
      createMutant({
        focus: { start: 7, text: '', end: 8 },
        list: { start: 5, end: 10 },
        kind: 'property',
        replacement: '',
        id: 'inner',
        start: 7,
        end: 8,
      }),
    ])

    expect(
      renderMutantRange(range!, source, { statementStarts: new Map() }),
    ).toBe(
      `(${RUNTIME}?.hitAny(["m1", "m2"]) ? { ...(${active('m1')} || ${active('m2')} ? {} : { a: { b } }) } : { a: (${RUNTIME}?.hitAny(["inner"]) ? { ...(${active('inner')} ? {} : { b }) } : { b }) })`,
    )
  })

  it('reaches the runtime with the given syntax', () => {
    let template = 'Math[Symbol.for(`mootant`)]'
    let ranges = groupMutantRanges([
      createMutant({ replacement: ';', kind: 'block', start: 0, end: 3 }),
      createMutant({ replacement: 'a--', start: 0, id: 'm2', end: 3 }),
      createMutant({
        focus: { text: '', start: 5, end: 6 },
        list: { start: 4, end: 7 },
        replacement: '',
        kind: 'element',
        start: 5,
        id: 'm3',
        end: 6,
      }),
    ])

    expect(
      ranges.map(range =>
        renderMutantRange(range, 'a++;[b]', {
          syntax: getSiteSyntax(true),
          statementStarts: new Map(),
        }),
      ),
    ).toStrictEqual([
      `{ if (${template}?.hit(\`m1\`)) {;} else {(${template}?.hit(\`m2\`) ? (a--) : (a++))} }`,
      `(${template}?.hitAny([\`m3\`]) ? ${template}.cut([(${template}.active === \`m3\` ? ${template}.gap : b)]) : [b])`,
    ])
  })
})
