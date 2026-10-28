import { describe, expect, it } from 'vitest'

import { renderStatusFilter } from '../../../../cli/html/client/render-status-filter'
import { countStatuses } from '../../../../core/run/count-statuses'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderStatusFilter', () => {
  let counts = countStatuses([
    { status: 'NoCoverage' },
    { status: 'Survived' },
    { status: 'Survived' },
    { status: 'Ignored' },
    { status: 'Killed' },
  ])

  it('offers All with the total, then each status with mutants in the given order', () => {
    expect(
      squashHtml(
        renderStatusFilter({
          statuses: ['Killed', 'Timeout', 'NoCoverage', 'Survived'],
          attribute: 'data-filter',
          filter: 'all',
          total: 5,
          counts,
        }),
      ),
    ).toBe(
      squashHtml(
        '<button class="segment-button" type="button" data-filter="all" aria-pressed="true">All <span class="count">5</span></button><button class="segment-button" type="button" data-filter="Killed" aria-pressed="false"><span class="dot status-killed"></span>Killed <span class="count">1</span></button><button class="segment-button" type="button" data-filter="NoCoverage" aria-pressed="false"><span class="dot status-no-coverage"></span>No coverage <span class="count">1</span></button><button class="segment-button" type="button" data-filter="Survived" aria-pressed="false"><span class="dot status-survived"></span>Survived <span class="count">2</span></button>',
      ),
    )
  })

  it('presses the button of the shown status and names the attribute as given', () => {
    let html = renderStatusFilter({
      attribute: 'data-mutants-filter',
      statuses: ['Survived', 'Killed'],
      filter: 'Survived',
      total: 5,
      counts,
    })

    expect(squashHtml(html)).toContain(
      squashHtml(
        'data-mutants-filter="all" aria-pressed="false">All <span class="count">5</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        'data-mutants-filter="Survived" aria-pressed="true"><span class="dot status-survived"></span>Survived <span class="count">2</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('data-mutants-filter="Killed" aria-pressed="false">'),
    )
  })
})
