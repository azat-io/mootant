import type { TemplateExpression } from '../../types/source/template-expression'

import { swapStringQuotes } from '../text/swap-string-quotes'

/**
 * Pattern of the start of an HTML character reference, which Vue decodes in its
 * templates.
 */
const REFERENCE_PATTERN = /&[#a-z]/iu

/**
 * Text of a replacement as written into a Vue template, or why it cannot be.
 */
type TemplateTextFit =
  { reason: string; kind: 'unfit' } | { text: string; kind: 'fit' }

/**
 * Fits a replacement into the Vue template code around it. Vue reads an
 * attribute value up to its closing quote and an interpolation up to its `}}`,
 * and decodes character references in both before it compiles them. Strings
 * written with the quote of the attribute are rewritten in the other quote; a
 * replacement that still holds the text that ends its code, or that holds the
 * start of a character reference, cannot be written.
 *
 * @param text - Replacement text.
 * @param delimiter - Text that ends the template code around the replacement.
 * @param lang - Language of the template expressions.
 * @returns The text to write, or why it cannot be written.
 */
export function fitTemplateText(
  text: string,
  delimiter: NonNullable<TemplateExpression['delimiter']>,
  lang: 'js' | 'ts',
): TemplateTextFit {
  if (REFERENCE_PATTERN.test(text)) {
    return {
      reason:
        'it would write an HTML character reference, which Vue decodes before it compiles the expression',
      kind: 'unfit',
    }
  }
  let fitted =
    delimiter === '}}' || !text.includes(delimiter) ?
      text
    : swapStringQuotes(text, delimiter, lang)
  if (fitted.includes(delimiter)) {
    return {
      reason:
        delimiter === '}}' ?
          'it would write }}, which ends the interpolation'
        : `it would write ${delimiter}, which ends the attribute value`,
      kind: 'unfit',
    }
  }
  return { text: fitted, kind: 'fit' }
}
