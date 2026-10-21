import type { Node } from 'oxc-parser'

import type { TestFile } from './create-test-file'

import { walkTree } from '../../core/tree/walk-tree'

/**
 * Finds the expression a test asks about in a snippet: the first argument of
 * the last call of the name `f`.
 *
 * @param file - Parsed snippet with at least one call `f(...)`.
 * @returns The first argument of the last such call.
 * @throws Error - When the snippet has no call of `f` with an argument.
 */
export function findProbe(file: TestFile): Node {
  let probes: Node[] = []
  walkTree(file.parsed.program, node => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'f' &&
      node.arguments.length > 0
    ) {
      probes.push(node.arguments[0]!)
    }
    return true
  })
  let probe = probes.at(-1)
  if (!probe) {
    throw new Error('The snippet has no call of f with an argument.')
  }
  return probe
}
