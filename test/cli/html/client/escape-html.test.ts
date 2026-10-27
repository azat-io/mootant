import { describe, expect, it } from 'vitest'

import { escapeHtml } from '../../../../cli/html/client/escape-html'

describe('escapeHtml', () => {
  it('escapes markup characters and quotes', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;',
    )
  })

  it('turns numbers into text', () => {
    expect(escapeHtml(42)).toBe('42')
  })
})
