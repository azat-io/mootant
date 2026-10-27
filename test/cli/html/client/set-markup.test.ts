// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { setMarkup } from '../../../../cli/html/client/set-markup'

describe('setMarkup', () => {
  it('replaces the content of an element', () => {
    let element = document.createElement('div')
    element.textContent = 'old'
    setMarkup(element, '<b>new</b>')

    expect(element.innerHTML).toBe('<b>new</b>')
  })
})
