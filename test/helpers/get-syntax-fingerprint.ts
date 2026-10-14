import type { Program } from 'oxc-parser'

import { getSourceBlocks } from '../../core/parser/get-source-blocks'
import { parseFile } from '../../core/parser/parse-file'

/**
 * Keys that only locate a node or repeat its source text, so two programs that
 * differ only in layout, comments or the spelling of a literal get the same
 * fingerprint.
 */
let skippedKeys = new Set(['range', 'start', 'raw', 'end'])

/**
 * Describes the syntax tree of a program without positions, parentheses, empty
 * statements and literal spellings: two programs get the same fingerprint
 * exactly when they have the same tree, the measure of the catalog's no-op and
 * syntactic distinctness checks (12.1). An expression mutant hosted in
 * parentheses, with or without the `;` of the hosting rule, keeps the
 * fingerprint of the same replacement written without them.
 *
 * @param file - File name, whose extension selects the language; every script
 *   block of a component file is a program of its own.
 * @param source - Text of the file.
 * @returns Canonical text of the trees of the file's programs, or null when one
 *   does not parse.
 */
export function getSyntaxFingerprint(
  file: string,
  source: string,
): string | null {
  let programs: Program[] = []
  for (let block of getSourceBlocks(file, source)) {
    let outcome = parseFile(file, block.text, block)
    if (outcome.kind === 'failed') {
      return null
    }
    programs.push(outcome.parsed.program)
  }
  return JSON.stringify(programs, (key, value: unknown) => {
    if (skippedKeys.has(key)) {
      return
    }
    if (typeof value === 'bigint') {
      return `${value}n`
    }
    if (Array.isArray(value)) {
      return (value as unknown[]).filter(
        item => !isNodeOfType(item, 'EmptyStatement'),
      )
    }
    let node = value
    while (isNodeOfType(node, 'ParenthesizedExpression')) {
      node = (node as { expression: unknown }).expression
    }
    return node
  })
}

/**
 * Tells whether a value is a syntax node of a type.
 *
 * @param value - Value of the tree.
 * @param type - Node type to check.
 * @returns Whether the value is such a node.
 */
function isNodeOfType(value: unknown, type: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === type
  )
}
