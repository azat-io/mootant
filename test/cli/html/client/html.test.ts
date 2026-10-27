import { describe, expect, it } from 'vitest'

import { html } from '../../../../cli/html/client/html'

describe('html', () => {
  it('joins the parts and the values, keeping the white space inside', () => {
    let parts = [
      '\n  <td>\n    <span class="dot"></span> ',
      ' ',
      '',
      '\n  </td>\n',
    ]
    let strings = Object.assign([...parts], { raw: parts })

    expect(html(strings, 'killed', undefined, false)).toBe(
      '<td>\n    <span class="dot"></span> killed false\n  </td>',
    )
  })
})
