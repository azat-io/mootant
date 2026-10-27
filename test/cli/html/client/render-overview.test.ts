import { describe, expect, it } from 'vitest'

import { renderOverview } from '../../../../cli/html/client/render-overview'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderOverview', () => {
  it('shows the score, the run, the mutants to act on, files, skips and warnings', () => {
    let html = renderOverview(indexReport(createHtmlReport()))

    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="score-value">50.00<span class="score-unit">%</span></span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="score-note">2 of 4 detected · covered 66.67%</span>',
      ),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('threshold'))
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="pill fail">✕ run failed · 1 mutant without a verdict</span>',
      ),
    )
    expect(squashHtml(html)).toContain(squashHtml('6 mutants in 1 file'))
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<a class="aside" href="#skipped" data-jump>1 more left out on purpose</a>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<li class="legend-item legend-killed"><span class="swatch segment status-killed"></span>killed <strong class="legend-count">1</strong></li>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<div><dt>runner</dt><dd>vitest 5.0.4</dd></div>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<div><dt>cache</dt><dd>off</dd></div>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        'start 210 ms · dry run 190 ms · batch 200 ms · isolated 700 ms',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '1 mutant survived: every test that reached it passed with the change in place. 1 mutant sits in code no test reaches. 1 mutant got no verdict.',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('data-attention="NoCoverage"'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('$ </span>mootant run src --html</code>'),
    )
    expect(squashHtml(html)).toContain(squashHtml('id="files-title"'))
    expect(squashHtml(html)).toContain(squashHtml('id="skipped-title"'))
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<li class="diagnostic"><span class="code-name warning">config-overridden</span> pool &quot;threads&quot; changed to &quot;forks&quot;.</li>',
      ),
    )
  })

  it('shows a threshold, a reused cache and a run without a score, mutants to act on or warnings', () => {
    let report = createHtmlReport()
    report.summary = {
      ...report.summary,
      duration: { ...report.summary.duration, batch: null },
      totalErrorMutants: 0,
      coveredScore: null,
      totalCached: 3,
      totalErrors: 2,
      threshold: 80,
      passed: false,
      score: null,
    }
    report.meta = { ...report.meta, runnerVersion: null, cache: true }
    report.mutants = report.mutants.filter(
      mutant => mutant.status === 'Ignored',
    )
    report.diagnostics = [
      {
        message: 'it broke',
        code: 'parse-error',
        severity: 'error',
        file: 'src/a.ts',
        column: 1,
        line: 2,
      },
      {
        code: 'mutator-error',
        severity: 'error',
        file: 'src/b.ts',
        message: 'odd',
        column: null,
        line: null,
      },
    ]
    report.skipped = []
    let html = renderOverview(indexReport(report))

    expect(squashHtml(html)).toContain(
      squashHtml('<span class="score-value">–</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="pill pass">✓ threshold 80% · passed</span><span class="pill fail">✕ run failed · 2 errors</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<div><dt>runner</dt><dd>vitest</dd></div>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<div><dt>cache</dt><dd>on, 3 reused</dd></div>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('start 210 ms · dry run 190 ms · isolated 700 ms</p>'),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('attention-title'))
    expect(squashHtml(html)).not.toContain(squashHtml('skipped-title'))
    expect(squashHtml(html)).toContain(squashHtml('src/a.ts:2 it broke'))
    expect(squashHtml(html)).toContain(squashHtml('src/b.ts odd'))

    report.summary = {
      ...report.summary,
      totalErrorMutants: 1,
      totalCached: null,
      totalErrors: 0,
      score: 75,
    }

    expect(squashHtml(renderOverview(indexReport(report)))).toContain(
      squashHtml(
        '<span class="pill fail">✕ threshold 80% · failed</span><span class="pill fail">✕ run failed · 1 mutant without a verdict</span>',
      ),
    )

    report.summary = { ...report.summary, totalErrorMutants: 0, score: 90 }

    let passing = renderOverview(indexReport(report))

    expect(squashHtml(passing)).toContain(
      squashHtml('<span class="pill pass">✓ threshold 80% · passed</span>'),
    )
    expect(squashHtml(passing)).not.toContain(squashHtml('run failed'))
  })

  it('describes only errors', () => {
    let report = createHtmlReport()
    report.mutants = report.mutants.filter(mutant => mutant.status === 'Error')

    expect(squashHtml(renderOverview(indexReport(report)))).toContain(
      squashHtml('<p class="lead">1 mutant got no verdict.</p>'),
    )
  })

  it('describes several survivors and uncovered mutants', () => {
    let report = createHtmlReport()
    report.mutants.push(
      { ...report.mutants[2]!, id: 'survived0002' },
      { ...report.mutants[4]!, id: 'uncovered002' },
    )
    report.mutants = report.mutants.filter(mutant => mutant.status !== 'Error')
    report.diagnostics = []
    let html = renderOverview(indexReport(report))

    expect(squashHtml(html)).toContain(
      squashHtml(
        '2 mutants survived: every test that reached them passed with the change in place. 2 mutants sit in code no test reaches.',
      ),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('data-attention="Error"'))
    expect(squashHtml(html)).not.toContain(squashHtml('Warnings'))
  })
})
