import type { Node } from 'oxc-parser'

import type { TypeInference } from '../../types/hints/type-inference'

import { createSyntacticTypeProvider } from '../../core/hints/create-syntactic-type-provider'
import { walkTree } from '../../core/tree/walk-tree'
import { createTestFile } from './create-test-file'

/**
 * Inference context of a snippet with a lookup by text.
 */
export interface InferenceSnippet {
  /**
   * Finds the first node with the text, outermost first.
   *
   * @param text - Text of the node.
   * @param type - Type of the node, when the outermost node with the text is
   *   not the wanted one.
   * @returns The node.
   */
  find(text: string, type?: string): Node

  /**
   * Recursion context backed by the syntactic provider of the snippet.
   */
  inference: TypeInference
}

/**
 * Parses a snippet and builds the inference context of its syntactic provider.
 * A snippet that does not parse fails the test.
 *
 * @param source - Text of the snippet.
 * @param file - File name, whose extension selects the language.
 * @returns The inference context and a lookup by text.
 * @throws Error - When the snippet has a parse error.
 */
export function createInferenceSnippet(
  source: string,
  file = 'example.ts',
): InferenceSnippet {
  let { parsed, scopes, tree } = createTestFile(source, file)
  let provider = createSyntacticTypeProvider(parsed, tree, scopes)
  let nodes: Node[] = []
  walkTree(parsed.program, node => {
    nodes.push(node)
    return true
  })
  return {
    find(text: string, type?: string): Node {
      let found = nodes.find(
        node =>
          (type ?? node.type) === node.type &&
          node.type !== 'ExpressionStatement' &&
          node.type !== 'Program' &&
          parsed.text.slice(node.start, node.end) === text,
      )
      if (!found) {
        throw new Error(`No node with the text ${text}.`)
      }
      return found
    },
    inference: {
      infer: node => provider.getType(node),
      language: parsed.language,
      scopes,
      tree,
    },
  }
}
