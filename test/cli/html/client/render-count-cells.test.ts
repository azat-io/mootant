import { describe, expect, it } from 'vitest'

import { renderCountCells } from '../../../../cli/html/client/render-count-cells'
import { countStatuses } from '../../../../core/run/count-statuses'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderCountCells', () => {
  it('shows killed, survived, uncovered and the rest', () => {
    expect(
      squashHtml(
        renderCountCells(
          countStatuses([
            { status: 'Killed' },
            { status: 'Survived' },
            { status: 'NoCoverage' },
            { status: 'Timeout' },
            { status: 'Error' },
            { status: 'Error' },
            { status: 'Ignored' },
          ]),
        ),
      ),
    ).toBe(
      squashHtml(
        '<td>1</td><td><span class="hot">1</span></td><td><span class="warn">1</span></td><td>1 timeout, <span class="bad">2 errors</span>, 1 ignored</td>',
      ),
    )
  })

  it('shows zero as a muted dash', () => {
    expect(squashHtml(renderCountCells(countStatuses([])))).toBe(
      squashHtml('<td><span class="zero">–</span></td>'.repeat(4)),
    )
  })
})
