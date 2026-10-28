import { describe, expect, it } from 'vitest'

import { computeScore } from '../../../core/run/compute-score'

describe('computeScore', () => {
  it('scores detected mutants over covered ones and over all', () => {
    expect(
      computeScore({
        NoCoverage: 2,
        Survived: 1,
        Ignored: 1,
        Timeout: 1,
        Killed: 1,
        Error: 1,
      }),
    ).toStrictEqual({ covered: 66.67, total: 40 })
  })

  it('counts mutants without coverage as undetected in the total only', () => {
    expect(
      computeScore({
        NoCoverage: 1,
        Survived: 0,
        Ignored: 0,
        Timeout: 0,
        Killed: 1,
        Error: 0,
      }),
    ).toStrictEqual({ covered: 100, total: 50 })
  })

  it('has no score without mutants to score', () => {
    expect(
      computeScore({
        NoCoverage: 0,
        Survived: 0,
        Ignored: 1,
        Timeout: 0,
        Killed: 0,
        Error: 1,
      }),
    ).toStrictEqual({ covered: null, total: null })
    expect(
      computeScore({
        NoCoverage: 1,
        Survived: 0,
        Ignored: 0,
        Timeout: 0,
        Killed: 0,
        Error: 0,
      }),
    ).toStrictEqual({ covered: null, total: 0 })
  })
})
