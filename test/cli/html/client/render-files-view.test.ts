import { describe, expect, it } from 'vitest'

import type { FileView } from '../../../../types/html/file-view'

import { renderFilesView } from '../../../../cli/html/client/render-files-view'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderFilesView', () => {
  it('lays out the file list, the head, the filter, the code and the panel', () => {
    let index = indexReport(createHtmlReport())
    let view: FileView = {
      file: index.files[0]!,
      filter: 'Survived',
      treeQuery: 'cart',
      showSkipped: true,
      selected: null,
      skip: null,
    }
    let html = renderFilesView(index, view)

    expect(squashHtml(html)).toContain(
      squashHtml('value="cart" data-tree-filter'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<h1 id="file-title"><span class="directory">src/</span>cart.ts</h1>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="stats">6 mutants · 2 killed · <span class="hot">1 survived</span> · 1 no coverage · score 50.00% · test time 600 ms</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<button class="segment-button" type="button" data-filter="all" aria-pressed="false">All <span class="count">6</span></button>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<button class="segment-button" type="button" data-filter="Survived" aria-pressed="true"><span class="dot status-survived"></span>Survived <span class="count">1</span></button>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        'data-filter="NoCoverage" aria-pressed="false"><span class="dot status-no-coverage"></span>No coverage',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<input type="checkbox" data-show-skipped checked> Skipped <span class="count">1</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<div class="line is-active" id="L4">'.replace(' is-active', ''),
      ),
    )
    expect(squashHtml(html)).toContain(squashHtml('id="panel"'))
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="range range-no-coverage">no coverage</span>'),
    )
  })

  it('shows a file without mutants, skips or text', () => {
    let report = createHtmlReport()
    report.files.push({ file: 'empty.ts', parsed: false, source: null })
    report.summary.staticCost = []
    let index = indexReport(report)
    let html = renderFilesView(index, {
      file: index.files[1]!,
      showSkipped: false,
      selected: null,
      treeQuery: '',
      filter: 'all',
      skip: null,
    })

    expect(squashHtml(html)).toContain(
      squashHtml('<h1 id="file-title">empty.ts</h1>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="stats">0 mutants · 0 killed · score –</span>'),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('data-show-skipped'))
    expect(squashHtml(html)).toContain(
      squashHtml('<p class="empty">The file could not be read.</p>'),
    )
  })

  it('shows the lines of an empty file that was read', () => {
    let report = createHtmlReport()
    report.files.push({ file: 'empty.ts', parsed: true, source: '' })
    let index = indexReport(report)
    let html = renderFilesView(index, {
      file: index.files[1]!,
      showSkipped: false,
      selected: null,
      treeQuery: '',
      filter: 'all',
      skip: null,
    })

    expect(squashHtml(html)).not.toContain(squashHtml('could not be read'))
    expect(squashHtml(html)).toContain(squashHtml('<div class="line" id="L1">'))
  })
})
