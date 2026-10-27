// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { serializeReportData } from '../../../../cli/html/serialize-report-data'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { setMarkup } from '../../../../cli/html/client/set-markup'

describe('main', () => {
  it('starts the report in the page', async () => {
    setMarkup(
      document.body,
      `<div id="app"></div><script type="application/json" id="report-data">${serializeReportData(createHtmlReport())}</script>`,
    )
    await import('../../../../cli/html/client/main')

    expect(document.querySelector('#main')?.textContent).toContain(
      'Mutation score',
    )
  })
})
