import type { RegexSource } from '../../types/regex/regex-source'
import type { TextEdit } from '../../types/source/text-edit'

import { encodePatternText } from './encode-pattern-text'
import { printRegexLiteral } from './print-regex-literal'

/**
 * Lone surrogate at the start of text.
 */
const LONE_SURROGATE_START = /^\p{Cs}/u

/**
 * Text of the node with a pattern edit, and the edit of the file it amounts to.
 */
interface PrintedEdit {
  /**
   * Edit of the file inside the node, which reports show.
   */
  focus: TextEdit

  /**
   * New text of the node that holds the pattern.
   */
  text: string
}

/**
 * Prints the node that holds a pattern with an edit of the pattern. The source
 * outside the edit is kept as written, quotes and escapes included; the edited
 * part grows to whole escape sequences and surrogate pairs and is written in
 * the source form of the pattern. A lone surrogate, written as a `\u` escape,
 * takes in the backslash of the identity escape before it in a literal or a
 * `String.raw` template, which would escape the new escape instead; an edit
 * after an octal-looking string escape such as `\0` takes the escape in when
 * the source after it would start with a digit, which would join them into a
 * legacy octal escape. In a template, when the edit would join `$` and `{` into
 * a substitution, the whole pattern is written anew instead. A literal whose
 * pattern becomes empty is printed with `(?:)`.
 *
 * @param source - The regular expression as read.
 * @param change - Edit with offsets relative to the pattern.
 * @returns The new text of the node and the edit of the file.
 */
export function printPatternEdit(
  source: RegexSource,
  change: TextEdit,
): PrintedEdit {
  let { offsets, pattern, form, code, node } = source
  let { start } = change
  while (start > 0 && offsets[start] === offsets[start - 1]) {
    start -= 1
  }
  let { end } = change
  while (end < pattern.length && offsets[end] === offsets[end - 1]) {
    end += 1
  }

  /**
   * Gives the pattern text of the edited part between two pattern offsets.
   *
   * @returns Text of the part as the regular expression sees it.
   */
  function getText(): string {
    return `${pattern.slice(start, change.start)}${change.text}${pattern.slice(change.end, end)}`
  }

  /**
   * Writes the edited part between two pattern offsets.
   *
   * @returns Text of the part in the source form.
   */
  function encode(): string {
    return encodePatternText(getText(), form, code[node.start]!)
  }

  if (
    (form === 'literal' || form === 'raw') &&
    LONE_SURROGATE_START.test(getText()) &&
    isEscaped(pattern, start)
  ) {
    start -= 1
  }
  let piece = encode()
  if (
    (form === 'string' || form === 'template') &&
    start > 0 &&
    isOctalEscape(code, offsets[start - 1]!) &&
    /^\d/u.test(piece || code[offsets[end]!]!)
  ) {
    start -= 1
    piece = encode()
  }
  if (
    form === 'template' &&
    joinsSubstitution(code[offsets[start]! - 1], piece, code[offsets[end]!])
  ) {
    start = 0
    end = pattern.length
    piece = encode()
  }
  let focus = { start: offsets[start]!, end: offsets[end]!, text: piece }
  let length = pattern.length - (change.end - change.start) + change.text.length
  if (form === 'literal' && length === 0) {
    return { text: printRegexLiteral('', source.flags), focus }
  }
  return {
    text: `${code.slice(node.start, focus.start)}${piece}${code.slice(focus.end, node.end)}`,
    focus,
  }
}

/**
 * Tells whether new text between two characters of a template starts or ends a
 * `${` with them.
 *
 * @param before - Character of the source before the text, if any.
 * @param text - New text.
 * @param after - Character of the source after the text, if any.
 * @returns Whether a `$` and a `{` meet at a seam.
 */
function joinsSubstitution(
  before: undefined | string,
  text: string,
  after = '',
): boolean {
  return (
    (before === '$' && `${text}${after}`.startsWith('{')) ||
    (text.endsWith('$') && after === '{')
  )
}

/**
 * Tells whether a backslash of the pattern escapes the unit at an offset: an
 * odd number of backslashes stands just before it.
 *
 * @param pattern - Pattern text.
 * @param index - Offset of the unit in the pattern.
 * @returns Whether the unit is escaped.
 */
function isEscaped(pattern: string, index: number): boolean {
  let count = 0
  while (pattern[index - count - 1] === '\\') {
    count += 1
  }
  return count % 2 === 1
}

/**
 * Tells whether the source at an offset starts an escape whose digit a digit
 * after it would extend: `\0` or a legacy octal escape.
 *
 * @param code - Text of the file.
 * @param offset - Offset of the source of a pattern unit.
 * @returns Whether a digit must not follow the escape.
 */
function isOctalEscape(code: string, offset: number): boolean {
  return code[offset] === '\\' && /[0-7]/u.test(code[offset + 1]!)
}
