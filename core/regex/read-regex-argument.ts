import type { Node } from 'oxc-parser'

import type { RegexSource } from '../../types/regex/regex-source'
import type { RegexCall } from '../../types/regex/regex-call'

import { mapPatternOffsets } from './map-pattern-offsets'
import { parseRegexPattern } from './parse-regex-pattern'
import { mapStringUnits } from './map-string-units'
import { compilesRegex } from './compiles-regex'

/**
 * Text that stands for an expression of a template pattern: an empty group,
 * which keeps the parts around it apart.
 */
const PLACEHOLDER = '(?:)'

/**
 * Pattern text of an argument with its source form and offsets.
 */
interface PatternParts {
  /**
   * How the pattern is written.
   */
  form: RegexSource['form']

  /**
   * Offsets of the pattern units in the file.
   */
  offsets: number[]

  /**
   * Pattern as the regular expression sees it.
   */
  pattern: string
}

/**
 * Reads the pattern argument of a `RegExp` call. A string literal, a template
 * literal without expressions and a `String.raw` template give their value as
 * the pattern; a template with expressions gives its text with `(?:)` in place
 * of every expression and is marked dynamic. The pattern must compile with the
 * flags of the call, and regexpp must parse it.
 *
 * @param regexCall - The call, as read.
 * @param code - Text of the file.
 * @returns The regular expression, or null when it cannot be read.
 */
export function readRegexArgument(
  regexCall: RegexCall,
  code: string,
): RegexSource | null {
  let { pattern: node, flags } = regexCall
  let parts = readPatternParts(node, code)
  if (parts === null || !compilesRegex(parts.pattern, flags)) {
    return null
  }
  let tree = parseRegexPattern(parts.pattern, flags)
  if (tree === null) {
    return null
  }
  return {
    dynamic: node.type === 'TemplateLiteral' && node.expressions.length > 0,
    flagsNode: regexCall.flagsNode,
    expression: regexCall.call,
    ...parts,
    flags,
    code,
    node,
    tree,
  }
}

/**
 * Reads the pattern text of an argument. The value read from the source must
 * equal the value the parser gives; a `String.raw` template must hold its raw
 * value as written, which a carriage return breaks, since the raw value reads
 * it as a line feed. In TypeScript the parser counts the backtick or the `}`
 * before the text of a template part, and the backtick or the `${` after it, as
 * part of it; in JavaScript a part is only its text. The first part of a
 * template starts with the template in TypeScript and just after its backtick
 * in JavaScript, which tells the two apart.
 *
 * @param node - Pattern argument of the call.
 * @param code - Text of the file.
 * @returns The pattern parts, or null when they cannot be read.
 */
function readPatternParts(node: Node, code: string): PatternParts | null {
  if (node.type === 'Literal') {
    let units = mapStringUnits(
      code,
      { start: node.start + 1, end: node.end - 1 },
      false,
    )
    return units.value === node.value ?
        { offsets: units.offsets, pattern: units.value, form: 'string' }
      : null
  }
  if (node.type === 'TaggedTemplateExpression') {
    let [quasi] = node.quasi.quasis
    let delimiter = quasi!.start === node.quasi.start ? 1 : 0
    let start = quasi!.start + delimiter
    let pattern = code.slice(start, quasi!.end - delimiter)
    return pattern === quasi!.value.raw ?
        { offsets: mapPatternOffsets(pattern, start), form: 'raw', pattern }
      : null
  }
  let { quasis } = node as Extract<Node, { type: 'TemplateLiteral' }>
  let isDelimited = quasis[0]!.start === node.start
  let offsets: number[] = []
  let pattern = ''
  for (let quasi of quasis) {
    let start = quasi.start + (isDelimited ? 1 : 0)
    let closing = quasi.tail ? 1 : 2
    let end = quasi.end - (isDelimited ? closing : 0)
    let units = mapStringUnits(code, { start, end }, true)
    if (units.value !== quasi.value.cooked) {
      return null
    }
    pattern += units.value
    offsets.push(...units.offsets.slice(0, -1))
    if (quasi.tail) {
      offsets.push(end)
    } else {
      pattern += PLACEHOLDER
      offsets.push(...Array.from(PLACEHOLDER, () => end))
    }
  }
  return { form: 'template', offsets, pattern }
}
