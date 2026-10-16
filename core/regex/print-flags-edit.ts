import type { Node } from 'oxc-parser'

import type { RegexSource } from '../../types/regex/regex-source'
import type { TextEdit } from '../../types/source/text-edit'

/**
 * Replaced node and its new text for new flags, with the edit of the file it
 * amounts to.
 */
interface PrintedFlags {
  /**
   * Edit of the file inside the node, which reports show.
   */
  focus: TextEdit

  /**
   * New text of the node.
   */
  text: string

  /**
   * Node replaced: the literal, the flags argument, or the call that gets one.
   */
  node: Node
}

/**
 * Prints new flags of a regular expression. A literal is printed with the new
 * flags after its pattern; the flags argument of a `RegExp` call is printed as
 * a string with the same quote; a call without flags gets them as a second
 * argument, quoted like a string pattern or with single quotes.
 *
 * @param source - The regular expression as read.
 * @param flags - New flags.
 * @returns The replaced node, its new text and the edit of the file.
 */
export function printFlagsEdit(
  source: RegexSource,
  flags: string,
): PrintedFlags {
  let { expression, flagsNode, code, node, form } = source
  if (form === 'literal') {
    let start = node.end - source.flags.length
    return {
      text: `${code.slice(node.start, start)}${flags}`,
      focus: { end: node.end, text: flags, start },
      node,
    }
  }
  if (flagsNode) {
    let quote = code[flagsNode.start]!
    return {
      focus: {
        start: flagsNode.start + 1,
        end: flagsNode.end - 1,
        text: flags,
      },
      text: `${quote}${flags}${quote}`,
      node: flagsNode,
    }
  }
  let [pattern] = (expression as Extract<Node, { type: 'NewExpression' }>)
    .arguments
  let quote = form === 'string' ? code[node.start]! : "'"
  let text = `, ${quote}${flags}${quote}`
  return {
    text: `${code.slice(expression.start, pattern!.end)}${text}${code.slice(pattern!.end, expression.end)}`,
    focus: { start: pattern!.end, end: pattern!.end, text },
    node: expression,
  }
}
