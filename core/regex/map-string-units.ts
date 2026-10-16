import type { SourceRange } from '../../types/source/source-range'

/**
 * Values of single-character escape sequences.
 */
const SIMPLE_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['b', '\b'],
  ['f', '\f'],
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['v', '\v'],
])

/**
 * Line terminators that an escape turns into a line continuation.
 */
const LINE_TERMINATORS = new Set(['\u{2028}', '\u{2029}', '\n', '\r'])

/**
 * Value of the text of a string or template literal, with the offset of every
 * code unit of it in the file.
 */
interface StringUnits {
  /**
   * Offset in the file where the source of every code unit of the value starts,
   * and the end of the text at the end.
   */
  offsets: number[]

  /**
   * Value the text stands for.
   */
  value: string
}

/**
 * Piece of a value read from the source, and the source length it takes.
 */
interface SourcePiece {
  /**
   * Length of its source text.
   */
  length: number

  /**
   * Units it adds to the value; empty for a line continuation.
   */
  text: string
}

/**
 * Reads the text between the quotes of a string literal, or of one part of a
 * template literal, into its value and the source offset of every code unit of
 * it. Escape sequences, including legacy octal ones, and surrogate pairs give
 * all their units the offset where they start; a line continuation adds no
 * unit. In a template, a carriage return with or without a line feed after it
 * reads as one line feed. The reader trusts the parser to have rejected invalid
 * escapes; its callers compare the value with the one the parser gives.
 *
 * @param code - Text of the file.
 * @param range - From the first character after the opening quote to the
 *   closing quote.
 * @param isTemplate - Whether the text belongs to a template literal.
 * @returns The value and the offsets of its units.
 */
export function mapStringUnits(
  code: string,
  range: SourceRange,
  isTemplate: boolean,
): StringUnits {
  let offsets: number[] = []
  let value = ''
  let index = range.start
  while (index < range.end) {
    let piece =
      code[index] === '\\' ?
        readEscape(code, index + 1)
      : readCharacter(code, index, isTemplate)
    value += piece.text
    for (let unit = 0; unit < piece.text.length; unit++) {
      offsets.push(index)
    }
    index += piece.length
  }
  offsets.push(range.end)
  return { offsets, value }
}

/**
 * Reads an escape sequence.
 *
 * @param code - Text of the file.
 * @param index - Offset of the character after the backslash.
 * @returns The piece, the backslash included in its length.
 */
function readEscape(code: string, index: number): SourcePiece {
  let next = code[index]!
  if (LINE_TERMINATORS.has(next)) {
    let length = next === '\r' && code[index + 1] === '\n' ? 3 : 2
    return { text: '', length }
  }
  let simple = SIMPLE_ESCAPES.get(next)
  if (simple !== undefined) {
    return { text: simple, length: 2 }
  }
  if (next === 'x') {
    return { text: readCode(code.slice(index + 1, index + 3), 16), length: 4 }
  }
  if (next === 'u') {
    if (code[index + 1] === '{') {
      let close = code.indexOf('}', index)
      return {
        text: readCode(code.slice(index + 2, close), 16),
        length: close - index + 2,
      }
    }
    return { text: readCode(code.slice(index + 1, index + 5), 16), length: 6 }
  }
  if (next >= '0' && next <= '7') {
    let [digits] = /^[0-7]{1,3}/u.exec(code.slice(index, index + 3))!
    if (next >= '4') {
      digits = digits.slice(0, 2)
    }
    return { text: readCode(digits, 8), length: digits.length + 1 }
  }
  let { text } = readCharacter(code, index, false)
  return { length: text.length + 1, text }
}

/**
 * Reads a character that is not an escape: a code point, or in a template a
 * carriage return with an optional line feed, which reads as a line feed.
 *
 * @param code - Text of the file.
 * @param index - Offset of the character.
 * @param isTemplate - Whether the text belongs to a template literal.
 * @returns The piece.
 */
function readCharacter(
  code: string,
  index: number,
  isTemplate: boolean,
): SourcePiece {
  if (isTemplate && code[index] === '\r') {
    return { length: code[index + 1] === '\n' ? 2 : 1, text: '\n' }
  }
  let length = code.codePointAt(index)! > 0xff_ff ? 2 : 1
  return { text: code.slice(index, index + length), length }
}

/**
 * Turns digits of a code point into its units.
 *
 * @param digits - Digits of the code point.
 * @param radix - Base of the digits.
 * @returns The units.
 */
function readCode(digits: string, radix: number): string {
  return String.fromCodePoint(Number.parseInt(digits, radix))
}
