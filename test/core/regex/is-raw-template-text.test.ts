import { describe, expect, it } from 'vitest'

import { isRawTemplateText } from '../../../core/regex/is-raw-template-text'

describe('isRawTemplateText', () => {
  it.each([String.raw`a\d+`, '\\`', '\\${', '$a{', '\\\\', ''])(
    'accepts %o',
    text => {
      expect(isRawTemplateText(text)).toBe(true)
    },
  )

  it.each(['`', '${', 'a\\', '\\\\\\', 'a\rb', '\\\r'])('rejects %o', text => {
    expect(isRawTemplateText(text)).toBe(false)
  })
})
