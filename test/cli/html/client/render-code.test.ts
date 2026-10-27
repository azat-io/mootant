// spell-checker:ignore FEFF
import { describe, expect, it } from 'vitest'

import { tokenizeSource } from '../../../../cli/html/client/tokenize-source'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { paintRanges } from '../../../../cli/html/client/paint-ranges'
import { renderCode } from '../../../../cli/html/client/render-code'

describe('renderCode', () => {
  let index = indexReport(createHtmlReport())
  let [file] = index.files
  let survivor = index.mutants[2]!

  it('numbers lines, counts mutants per status and marks ranges', () => {
    let html = renderCode({
      painted: paintRanges(file!.source.length, [
        { start: survivor.start, end: survivor.end, value: 2, rank: 7 },
      ]),
      tokens: tokenizeSource(file!.source),
      mutants: index.mutants,
      visible: file!.mutants,
      selected: null,
      skipped: null,
      file: file!,
    })

    expect(html).toContain(
      `<div class="line" id="L1"><span class="line-number">1</span><span class="line-badges"><button class="tally status-killed" type="button" data-line="1" data-status="Killed" aria-label="1 killed on line 1">1</button></span><span class="line-code"><span class="token-keyword">export</span> <span class="token-keyword">let</span> unit = 'cm'</span></div>`,
    )
    expect(html).toContain(
      '<button class="tally status-survived" type="button" data-line="4" data-status="Survived" aria-label="1 survived on line 4">1</button><button class="tally status-error" type="button" data-line="4" data-status="Error" aria-label="1 error on line 4">1</button>',
    )
    expect(html).toContain(
      '<span class="range range-survived" data-mutant="2">size &lt; limit</span>',
    )
    expect(html).toContain('data-status="Ignored"')
    expect(html).toContain(
      '<div class="line" id="L9"><span class="line-number">9</span><span class="line-badges"></span><span class="line-code"> </span></div>',
    )
  })

  it('marks the selected mutant, its lines and the skipped candidates', () => {
    let html = renderCode({
      skipped: paintRanges(file!.source.length, [
        { start: survivor.start, end: survivor.end, value: 0, rank: 0 },
      ]),
      painted: paintRanges(file!.source.length, []),
      tokens: tokenizeSource(file!.source),
      mutants: index.mutants,
      selected: survivor,
      visible: [],
      file: file!,
    })

    expect(html).toContain('<div class="line is-active" id="L4">')
    expect(html).toContain(
      '<span class="range range-skipped is-selected selected-survived" data-skip="0">size &lt; limit</span>',
    )
    expect(html).toContain(
      '<button class="tally status-skipped" type="button" data-line-skip="4" aria-label="1 skipped on line 4, show the next">1</button>',
    )
  })

  it('splits lines at every terminator and leaves the byte order mark out', () => {
    let source = '\u{FEFF}a\rb\u{2028}c'
    let report = createHtmlReport()
    report.files[0]!.source = source
    report.mutants = []
    report.skipped = []
    let lines = indexReport(report)
    let html = renderCode({
      painted: paintRanges(source.length, []),
      tokens: tokenizeSource(source),
      mutants: lines.mutants,
      file: lines.files[0]!,
      selected: null,
      skipped: null,
      visible: [],
    })

    expect(
      [...html.matchAll(/<span class="line-code">(?<text>[^<]*)</gu)].map(
        match => match.groups!['text'],
      ),
    ).toStrictEqual(['a', 'b', 'c'])
  })

  it('leaves carriage returns out of the lines', () => {
    let report = createHtmlReport()
    report.files[0]!.source = 'a\r\nb'
    report.mutants = []
    report.skipped = []
    let crlf = indexReport(report)
    let html = renderCode({
      tokens: tokenizeSource('a\r\nb'),
      painted: paintRanges(4, []),
      mutants: crlf.mutants,
      file: crlf.files[0]!,
      selected: null,
      skipped: null,
      visible: [],
    })

    expect(html).toContain('<span class="line-code">a</span>')
    expect(html).not.toContain('\r')
  })
})
