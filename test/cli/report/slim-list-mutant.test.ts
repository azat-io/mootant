import { describe, expect, it } from 'vitest'

import { createListReportMutant } from '../../helpers/create-list-report-mutant'
import { slimListMutant } from '../../../cli/report/slim-list-mutant'

/**
 * Pending mutant of `example.ts` at the top level, its line cut at the end.
 */
let mutant = createListReportMutant({ cutEnd: 12 })

describe('slimListMutant', () => {
  it('keeps the position, mutator, status and source lines marked where they were cut, without offsets and null fields', () => {
    expect(slimListMutant(mutant)).toStrictEqual({
      before: ["let unit = 'cm'…"],
      after: ["let unit = ''…"],
      mutator: 'string-literal',
      id: '000000000001',
      file: 'example.ts',
      status: 'Pending',
      column: 12,
      line: 1,
    })
  })

  it('keeps the scope, focus, ignore directive and reason when they are set', () => {
    expect(
      slimListMutant({
        ...mutant,
        focus: {
          replacement: '',
          original: 'cm',
          column: 13,
          start: 12,
          line: 1,
          end: 14,
        },
        ignoredBy: {
          directive: 'mootant-ignore-next-line',
          column: 1,
          line: 1,
        },
        reason: 'shown elsewhere',
        status: 'Ignored',
        scope: 'unit',
      }),
    ).toMatchObject({
      ignoredBy: { directive: 'mootant-ignore-next-line', column: 1, line: 1 },
      focus: { replacement: '', original: 'cm', column: 13, line: 1 },
      reason: 'shown elsewhere',
      status: 'Ignored',
      scope: 'unit',
    })
  })
})
