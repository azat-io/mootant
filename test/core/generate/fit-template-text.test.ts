import { describe, expect, it } from 'vitest'

import { fitTemplateText } from '../../../core/generate/fit-template-text'

describe('fitTemplateText', () => {
  it('keeps text that fits as it is', () => {
    expect(fitTemplateText(`a ? 'x' : ""`, '}}', 'js')).toStrictEqual({
      text: `a ? 'x' : ""`,
      kind: 'fit',
    })
    expect(fitTemplateText(`a && 'x'`, '"', 'js')).toStrictEqual({
      text: `a && 'x'`,
      kind: 'fit',
    })
  })

  it('rewrites strings in the quote of the attribute', () => {
    expect(fitTemplateText(`a || ''`, "'", 'ts')).toStrictEqual({
      text: `a || ""`,
      kind: 'fit',
    })
  })

  it('gives the reason when the text cannot be written', () => {
    expect(fitTemplateText('`"`', '"', 'js')).toStrictEqual({
      reason: 'it would write ", which ends the attribute value',
      kind: 'unfit',
    })
    expect(fitTemplateText('{ a: {}}.a', '}}', 'js')).toStrictEqual({
      reason: 'it would write }}, which ends the interpolation',
      kind: 'unfit',
    })
    expect(fitTemplateText('a &&lt', '"', 'js')).toStrictEqual({
      reason:
        'it would write an HTML character reference, which Vue decodes before it compiles the expression',
      kind: 'unfit',
    })
    expect(fitTemplateText('a &#38; b', '}}', 'js').kind).toBe('unfit')
  })
})
