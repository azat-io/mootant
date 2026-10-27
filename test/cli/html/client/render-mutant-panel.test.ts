import { describe, expect, it } from 'vitest'

import { renderMutantPanel } from '../../../../cli/html/client/render-mutant-panel'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderMutantPanel', () => {
  let report = createHtmlReport()
  report.texts.push('fits')
  report.mutants[2]!.scope = report.texts.length - 1
  report.mutants[2]!.cached = true
  let index = indexReport(report)
  let { mutants } = index

  it('shows a survivor with where to add a test and how to run it again', () => {
    let html = renderMutantPanel(index, mutants[2]!, mutants)

    expect(squashHtml(html)).toContain(
      squashHtml('<span class="status status-survived">survived</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="where">line 4:10 · surv</span>'),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('disabled'))
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<dt>mutator</dt><dd><code>comparison-operator</code><br><span class="muted">Changes a comparison operator.</span></dd><dt>in</dt><dd><code>fits</code></dd><dt>tests</dt><dd>2 tests reached it, all passed</dd><dt>time</dt><dd>2 ms · cached verdict</dd>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="changed">size &lt; limit</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<ul class="test-files"><li><span>test/cart.test.ts</span><span class="dim">2 tests</span></li><li><span>test/other.test.ts</span><span class="dim">related</span></li></ul>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        'Start from <span class="test-name"><span class="suite">fits › </span><b>small sizes</b></span> <span class="test-path">test/cart.test.ts:12</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<summary><svg class="icon icon-chevron-down"'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('</svg> All 2 tests that reach it</summary>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="label">Also here</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="muted">error</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="label">Left out here</span>'),
    )
    expect(squashHtml(html)).toContain(squashHtml('data-skip="0"'))
    expect(squashHtml(html)).toContain(
      squashHtml('$ </span>mootant run src --mutant surv</code>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        'data-copy="// mootant-ignore-next-line comparison-operator: "',
      ),
    )
  })

  it('shows a kill with the test that failed and its message', () => {
    let html = renderMutantPanel(index, mutants[0]!, mutants)

    expect(squashHtml(html)).toContain(
      squashHtml('aria-label="Previous mutant" disabled'),
    )
    expect(squashHtml(html)).toContain(squashHtml('<dd>1 test reach it</dd>'))
    expect(squashHtml(html)).toContain(
      squashHtml('<dd>2 ms · batch verdict, may be false</dd>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="label">Killed by</span><ul class="test-list"><li class="test-item is-killer"><span class="dot"></span><span class="test-name"><span class="suite">cart › </span><b>unit</b></span><span class="where">4 ms</span></li></ul><p class="test-path">test/cart.test.ts:4</p><p class="message">expected &#39;&#39; to be &#39;cm&#39;</p>'.replaceAll(
          '&#39;',
          "'",
        ),
      ),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('Also here'))
  })

  it('shows a timeout that no single test decided', () => {
    let html = renderMutantPanel(index, mutants[1]!, [mutants[1]!])

    expect(squashHtml(html)).toContain(
      squashHtml('aria-label="Next mutant" disabled'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('static: reached while a test file loads'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="label">Timed out in</span><p class="advice">test/limit.test.ts failed outside its tests (time-limit).</p>',
      ),
    )
  })

  it('shows an error, a mutant without coverage and an ignored one', () => {
    expect(squashHtml(renderMutantPanel(index, mutants[3]!, []))).toContain(
      squashHtml(
        '<span class="label">No verdict</span><p class="message">Tries of test/cart.test.ts went missing twice.</p>',
      ),
    )
    let uncovered = renderMutantPanel(index, mutants[4]!, [])

    expect(squashHtml(uncovered)).toContain(
      squashHtml('<dd>no test reaches it</dd>'),
    )
    expect(squashHtml(uncovered)).toContain(
      squashHtml('No test file is related to this module yet.'),
    )
    expect(squashHtml(uncovered)).not.toContain(squashHtml('Start from'))
    let ignored = renderMutantPanel(index, mutants[5]!, [])

    expect(squashHtml(ignored)).toContain(squashHtml('<dd>not run</dd>'))
    expect(squashHtml(ignored)).toContain(
      squashHtml(
        '<code>mootant-ignore-next-line on line 7</code>: shown elsewhere',
      ),
    )
    expect(squashHtml(ignored)).not.toContain(squashHtml('Run it again'))
  })

  it('shows verdicts without a test, message, comment or reason', () => {
    let bare = createHtmlReport()
    let [killed, , survived, errored, , ignored] = bare.mutants
    delete killed!.killedBy
    delete killed!.killedIn
    delete killed!.cause
    delete errored!.message
    delete ignored!.ignoredBy
    delete ignored!.reason
    survived!.coveredBy = Array.from({ length: 45 }, () => 0)
    let bareIndex = indexReport(bare)
    let [first, , many, error, , quiet] = bareIndex.mutants

    expect(squashHtml(renderMutantPanel(bareIndex, first!, []))).toContain(
      squashHtml(
        '<p class="advice">A test file failed outside its tests (no cause).</p>',
      ),
    )
    expect(squashHtml(renderMutantPanel(bareIndex, many!, []))).toContain(
      squashHtml('<p class="test-path">and 5 more</p>'),
    )
    expect(squashHtml(renderMutantPanel(bareIndex, error!, []))).toContain(
      squashHtml('<p class="advice">See the warnings of the run.</p>'),
    )
    expect(squashHtml(renderMutantPanel(bareIndex, quiet!, []))).toContain(
      squashHtml('<code>an ignore comment</code></p>'),
    )

    bare.tests = bare.tests.map(test => ({ ...test, line: null }))
    let lineless = indexReport(bare)

    expect(
      squashHtml(renderMutantPanel(lineless, lineless.mutants[2]!, [])),
    ).toContain(
      squashHtml('<span class="test-path">test/cart.test.ts</span></p>'),
    )
    let killer = createHtmlReport()
    killer.tests = killer.tests.map(test => ({ ...test, line: null }))
    let killerIndex = indexReport(killer)

    expect(
      squashHtml(renderMutantPanel(killerIndex, killerIndex.mutants[0]!, [])),
    ).toContain(squashHtml('<p class="test-path">test/cart.test.ts</p>'))
  })
})
