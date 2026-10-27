import { describe, expect, it } from 'vitest'

import { renderStatusBar } from '../../../../cli/html/client/render-status-bar'
import { countStatuses } from '../../../../cli/html/client/count-statuses'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderStatusBar', () => {
  it('draws a segment as wide as each status with counts for assistive technology', () => {
    expect(
      squashHtml(
        renderStatusBar(
          countStatuses([
            { status: 'Killed' },
            { status: 'Killed' },
            { status: 'Killed' },
            { status: 'NoCoverage' },
          ]),
        ),
      ),
    ).toBe(
      squashHtml(
        '<div class="status-bar" role="img" aria-label="3 killed, 1 no coverage"><span class="segment status-killed" style="flex-basis: 75%"></span><span class="segment status-no-coverage" style="flex-basis: 25%"></span></div>',
      ),
    )
  })

  it('draws an empty small bar without mutants', () => {
    expect(squashHtml(renderStatusBar(countStatuses([]), true))).toBe(
      squashHtml(
        '<div class="status-bar small" role="img" aria-label="no mutants"></div>',
      ),
    )
  })
})
