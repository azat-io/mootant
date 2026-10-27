import { describe, expect, it } from 'vitest'

import type { FileView } from '../../../../types/html/file-view'

import { renderSidePanel } from '../../../../cli/html/client/render-side-panel'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderSidePanel', () => {
  let index = indexReport(createHtmlReport())
  let [file] = index.files
  let view: FileView = {
    showSkipped: false,
    selected: null,
    treeQuery: '',
    filter: 'all',
    file: file!,
    skip: null,
  }

  it('shows the selected mutant with the mutants of the filter to step through', () => {
    let html = renderSidePanel(index, {
      ...view,
      selected: index.mutants[2]!,
      filter: 'Survived',
    })

    expect(squashHtml(html)).toContain(
      squashHtml('aria-label="Previous mutant" disabled'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('aria-label="Next mutant" disabled'),
    )
    expect(
      squashHtml(
        renderSidePanel(index, { ...view, selected: index.mutants[2]! }),
      ),
    ).not.toContain(squashHtml('aria-label="Next mutant" disabled'))
  })

  it('shows the selected skipped candidate, else the file', () => {
    expect(
      squashHtml(renderSidePanel(index, { ...view, skip: file!.skipped[0]! })),
    ).toContain(squashHtml('Left out on purpose'))
    expect(squashHtml(renderSidePanel(index, view))).toContain(
      squashHtml('Mutators here'),
    )
  })
})
