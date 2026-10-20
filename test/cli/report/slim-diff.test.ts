import { describe, expect, it } from 'vitest'

import { slimDiff } from '../../../cli/report/slim-diff'

describe('slimDiff', () => {
  it('keeps lines that were not cut as they are, without changing the report', () => {
    let diff = {
      before: ['if (a) {', '  b()', '}'],
      after: [';'],
      cutStart: 0,
      cutEnd: 0,
    }

    let slim = slimDiff(diff)

    expect(slim).toStrictEqual({
      before: ['if (a) {', '  b()', '}'],
      after: [';'],
    })
    expect(slim.before).not.toBe(diff.before)
    expect(slim.after).not.toBe(diff.after)
  })

  it('marks both ends of a line cut at both ends on both sides', () => {
    let diff = {
      before: ['= /x[0-9]/.test(a)'],
      after: ['= /x[^]/.test(a)'],
      cutStart: 10,
      cutEnd: 30,
    }

    expect(slimDiff(diff)).toStrictEqual({
      before: ['…= /x[0-9]/.test(a)…'],
      after: ['…= /x[^]/.test(a)…'],
    })
    expect(diff.before).toStrictEqual(['= /x[0-9]/.test(a)'])
  })

  it('marks the start of the first line and the end of the last one of each side', () => {
    expect(
      slimDiff({
        before: ['x = f(', '  a,', ') ?? b'],
        after: ['x = f(a) || b'],
        cutStart: 4,
        cutEnd: 0,
      }),
    ).toStrictEqual({
      before: ['…x = f(', '  a,', ') ?? b'],
      after: ['…x = f(a) || b'],
    })
    expect(
      slimDiff({
        before: ['x = f(', '  a,', ') ?? b'],
        after: ['x = f(a) || b'],
        cutStart: 0,
        cutEnd: 7,
      }),
    ).toStrictEqual({
      before: ['x = f(', '  a,', ') ?? b…'],
      after: ['x = f(a) || b…'],
    })
  })
})
