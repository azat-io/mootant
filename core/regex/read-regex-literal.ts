import type { Node } from 'oxc-parser'

import type { RegexSource } from '../../types/regex/regex-source'

import { parseRegexPattern } from './parse-regex-pattern'
import { mapPatternOffsets } from './map-pattern-offsets'

/**
 * Reads a regular expression literal: its pattern and flags as written, and the
 * pattern tree. Only a literal that compiles is read; the parser builds its
 * value with `new RegExp` and leaves null when that throws.
 *
 * @param node - Node of the runtime tree.
 * @param code - Text of the file.
 * @returns The literal, or null for another node, a literal that does not
 *   compile, or a pattern regexpp cannot parse.
 */
export function readRegexLiteral(node: Node, code: string): RegexSource | null {
  if (node.type !== 'Literal' || !('regex' in node) || node.value === null) {
    return null
  }
  let text = code.slice(node.start, node.end)
  let slash = text.lastIndexOf('/')
  let pattern = text.slice(1, slash)
  let flags = text.slice(slash + 1)
  let tree = parseRegexPattern(pattern, flags)
  if (tree === null) {
    return null
  }
  return {
    offsets: mapPatternOffsets(pattern, node.start + 1),
    expression: node,
    form: 'literal',
    flagsNode: null,
    dynamic: false,
    pattern,
    flags,
    code,
    node,
    tree,
  }
}
