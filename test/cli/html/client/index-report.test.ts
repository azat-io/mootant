// spell-checker:ignore FEFF
import { describe, expect, it } from 'vitest'

import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'

describe('indexReport', () => {
  it('reads positions, original texts, counts and scores', () => {
    let index = indexReport(createHtmlReport())
    let [file] = index.files

    expect(file).toMatchObject({
      cost: { file: 'src/cart.ts', duration: 600, mutants: 1, units: 2 },
      counts: { NoCoverage: 1, Survived: 1, Timeout: 1, Killed: 1 },
      directory: 'src',
      name: 'cart.ts',
      score: 50,
    })
    expect(
      index.mutants.map(mutant => [mutant.id, mutant.line, mutant.column]),
    ).toStrictEqual([
      ['killed000001', 1, 19],
      ['timeout00001', 2, 20],
      ['survived0001', 4, 10],
      ['errored00001', 4, 10],
      ['uncovered001', 6, 20],
      ['ignored00001', 8, 20],
    ])
    expect(index.mutants[2]).toMatchObject({
      original: 'size < limit',
      endLine: 4,
      index: 2,
    })
    expect(file!.skipped[0]).toMatchObject({
      original: 'size < limit',
      column: 10,
      index: 0,
      line: 4,
    })
    expect(index.actionable.map(mutant => mutant.id)).toStrictEqual([
      'survived0001',
      'errored00001',
      'uncovered001',
    ])
    expect(index.byId.get('timeout00001')).toBe(index.mutants[1])
    expect(
      index.mutators.map(mutator => [
        mutator.id,
        mutator.score,
        mutator.skipped,
      ]),
    ).toStrictEqual([
      ['string-literal', 100, 0],
      ['number-literal', 100, 0],
      ['comparison-operator', 0, 1],
      ['conditional', null, 0],
      ['arithmetic-operator', 0, 0],
    ])
  })

  it('orders files by score, then survivors, then path, and reads a missing source as empty', () => {
    let report = createHtmlReport()
    report.files.push(
      { parsed: false, file: 'b.ts', source: null },
      { file: 'a.ts', parsed: true, source: 'x' },
      { source: 'let c = 1', file: 'c.ts', parsed: true },
    )
    report.mutants.push(
      { ...report.mutants[0]!, start: 0, id: 'b', file: 1, end: 0 },
      {
        ...report.mutants[0]!,
        status: 'Survived',
        start: 4,
        id: 'c',
        file: 3,
        end: 5,
      },
    )
    let index = indexReport(report)

    expect(index.worstFiles.map(file => file.path)).toStrictEqual([
      'c.ts',
      'src/cart.ts',
      'b.ts',
      'a.ts',
    ])
    expect(index.files[1]).toMatchObject({
      readable: false,
      directory: '',
      name: 'b.ts',
      source: '',
      cost: null,
    })
    expect(index.files[2]!.readable).toBe(true)
  })

  it('places mutants at every line terminator and after a byte order mark', () => {
    let report = createHtmlReport()
    report.files[0]!.source = '\u{FEFF}let a = 1\rlet b = 2\u{2028}let c'
    report.mutants = [
      { ...report.mutants[0]!, start: 19, end: 20 },
      { ...report.mutants[0]!, id: 'first', start: 1, end: 4 },
    ]
    report.skipped = []

    expect(
      indexReport(report).mutants.map(mutant => [
        mutant.line,
        mutant.column,
        mutant.original,
      ]),
    ).toStrictEqual([
      [2, 9, '2'],
      [1, 1, 'let'],
    ])
  })

  it('restores replacements stored as a difference from the original', () => {
    let report = createHtmlReport()
    report.mutants[2] = { ...report.mutants[2]!, replacement: '', keep: [4, 6] }
    report.skipped[0] = {
      ...report.skipped[0]!,
      replacement: '>',
      keep: [4, 0],
    }
    let index = indexReport(report)

    expect(index.mutants[2]!.replacement).toBe('size limit')
    expect(index.files[0]!.skipped[0]!.replacement).toBe('size>')
  })
})
