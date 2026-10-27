import { describe, expect, it } from 'vitest'

import { renderChange } from '../../../../cli/html/client/render-change'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderChange', () => {
  it('shows the range before and after the change on one line', () => {
    let source = 'if (a <\n  b) {}'

    expect(
      squashHtml(
        renderChange(source, { replacement: 'a <= b', start: 4, end: 11 }),
      ),
    ).toBe(
      squashHtml(
        '<span class="change"><span class="before">a &lt; b</span><span class="arrow" aria-label="becomes">→</span><span class="after">a &lt;= b</span></span>',
      ),
    )
  })

  it('shows a removal as removed', () => {
    expect(
      squashHtml(renderChange('call()', { replacement: '', start: 0, end: 6 })),
    ).toContain(squashHtml('<span class="removed">removed</span>'))
  })

  it('shows the focus of a long range, and cuts long text', () => {
    let pattern = `/${'a'.repeat(70)}b/`
    let focused = renderChange(pattern, {
      focus: { replacement: '', start: 71, end: 72 },
      replacement: `/${'a'.repeat(70)}/`,
      end: pattern.length,
      start: 0,
    })
    let cut = renderChange(pattern, {
      end: pattern.length,
      replacement: 'x',
      start: 0,
    })

    expect(squashHtml(focused)).toContain(
      squashHtml('<span class="before">b</span>'),
    )
    expect(squashHtml(cut)).toContain(
      squashHtml(`<span class="before">/${'a'.repeat(62)}…</span>`),
    )
  })
})
