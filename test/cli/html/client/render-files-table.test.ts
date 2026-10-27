import { describe, expect, it } from 'vitest'

import { renderFilesTable } from '../../../../cli/html/client/render-files-table'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderFilesTable', () => {
  it('lists each file with its bar, score, counts and test time', () => {
    let report = createHtmlReport()
    report.files.push({ file: 'clean.ts', parsed: true, source: '' })
    let html = renderFilesTable(indexReport(report))

    expect(squashHtml(html)).toContain(
      squashHtml(
        '<tr data-href="#/file/src/cart.ts"><th scope="row"><a class="name" href="#/file/src/cart.ts">src/cart.ts</a></th>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<td class="name">50.00%</td><td>6</td><td>1</td><td><span class="hot">1</span></td><td><span class="warn">1</span></td><td>1 timeout, <span class="bad">1 error</span>, 1 ignored</td><td class="dim">600 ms</td></tr>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<td class="name">–</td><td>0</td><td><span class="zero">–</span></td>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<td class="dim">–</td></tr>'),
    )
  })
})
