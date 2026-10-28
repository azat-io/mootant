import { describe, expect, it } from 'vitest'

import { filterByStatus } from '../../../../cli/html/client/filter-by-status'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'

describe('filterByStatus', () => {
  let { mutants } = indexReport(createHtmlReport())

  it('keeps every mutant in order for all', () => {
    expect(
      filterByStatus(mutants, 'all').map(mutant => mutant.id),
    ).toStrictEqual(mutants.map(mutant => mutant.id))
  })

  it('keeps only the mutants of the status', () => {
    expect(
      filterByStatus(mutants, 'Survived').map(mutant => mutant.id),
    ).toStrictEqual(['survived0001'])
  })
})
