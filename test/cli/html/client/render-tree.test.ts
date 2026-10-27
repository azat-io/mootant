import { describe, expect, it } from 'vitest'

import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { renderTree } from '../../../../cli/html/client/render-tree'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderTree', () => {
  let report = createHtmlReport()
  report.files.push(
    { file: 'index.ts', parsed: true, source: 'x' },
    { file: 'src/a.ts', parsed: true, source: '' },
  )
  report.mutants.push({
    ...report.mutants[0]!,
    status: 'Error',
    id: 'other',
    start: 0,
    file: 1,
    end: 1,
  })
  let index = indexReport(report)

  it('groups files by directory with their badges', () => {
    let html = renderTree(index.files, index.files[0]!, '')

    expect(squashHtml(html)).toBe(
      squashHtml(
        '<li><a class="tree-file" href="#/file/index.ts"><span class="file-name">index.ts</span><span class="tally status-error" title="1 error">1</span></a></li><li class="tree-directory">src/</li><li><a class="tree-file nested" href="#/file/src/a.ts"><span class="file-name">a.ts</span></a></li><li><a class="tree-file nested" href="#/file/src/cart.ts" aria-current="page"><span class="file-name">cart.ts</span><span class="tally status-survived" title="1 survived">1</span><span class="tally status-no-coverage" title="1 without coverage">1</span><span class="tally status-error" title="1 error">1</span></a></li>',
      ),
    )
  })

  it('keeps the files whose path has the text', () => {
    expect(squashHtml(renderTree(index.files, null, 'CART'))).not.toContain(
      squashHtml('index.ts'),
    )
    expect(squashHtml(renderTree(index.files, null, 'none'))).toBe(
      squashHtml('<li class="tree-empty">No file matches.</li>'),
    )
  })
})
