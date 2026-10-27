import { describe, expect, it } from 'vitest'

import { renderTestName } from '../../../../cli/html/client/render-test-name'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderTestName', () => {
  it('mutes the suites and makes the own name bold', () => {
    expect(squashHtml(renderTestName('cart > total > <b>'))).toBe(
      squashHtml(
        '<span class="test-name"><span class="suite">cart › total › </span><b>&lt;b&gt;</b></span>',
      ),
    )
  })

  it('shows a name without suites', () => {
    expect(squashHtml(renderTestName('works'))).toBe(
      squashHtml('<span class="test-name"><b>works</b></span>'),
    )
  })
})
