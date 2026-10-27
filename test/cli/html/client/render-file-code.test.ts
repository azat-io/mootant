import { describe, expect, it } from 'vitest'

import type { FileView } from '../../../../types/html/file-view'

import { renderFileCode } from '../../../../cli/html/client/render-file-code'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'

describe('renderFileCode', () => {
  let index = indexReport(createHtmlReport())
  let view: FileView = {
    file: index.files[0]!,
    showSkipped: false,
    selected: null,
    treeQuery: '',
    filter: 'all',
    skip: null,
  }

  it('marks the mutants to act on and counts every mutant', () => {
    let html = renderFileCode(index, view)

    expect(html).toContain('range-survived')
    expect(html).toContain('range-no-coverage')
    expect(html).not.toContain('range-killed')
    expect(html).toContain('data-status="Killed"')
    expect(html).not.toContain('range-skipped')
  })

  it('marks only the mutants of the filtered status, and the skipped candidates', () => {
    let html = renderFileCode(index, {
      ...view,
      showSkipped: true,
      filter: 'Killed',
    })

    expect(html).toContain('range-killed')
    expect(html).not.toContain('range-survived')
    expect(html).not.toContain('data-status="Survived"')
    expect(html).toContain('range-skipped')
  })
})
