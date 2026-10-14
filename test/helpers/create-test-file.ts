import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/scope-analysis'
import type { SyntaxHelpers } from '../../types/syntax-helpers'
import type { ParsedFile } from '../../types/parsed-file'
import type { SourceCode } from '../../types/source-code'
import type { TreeIndex } from '../../types/tree-index'
import type { TypeHints } from '../../types/type-hints'

import { createSyntacticTypeProvider } from '../../core/hints/create-syntactic-type-provider'
import { createSyntaxHelpers } from '../../core/syntax/create-syntax-helpers'
import { createSourceCode } from '../../core/text/create-source-code'
import { createTypeHints } from '../../core/hints/create-type-hints'
import { analyzeScopes } from '../../core/hints/analyze-scopes'
import { parseFile } from '../../core/parser/parse-file'
import { indexTree } from '../../core/tree/index-tree'
import { walkTree } from '../../core/tree/walk-tree'

/**
 * Snippet parsed for a test, with everything a mutator context holds.
 */
export interface TestFile {
  /**
   * Finds a node of the whole tree, type positions and skipped code included,
   * in pre-order.
   *
   * @param type - Node type to look for.
   * @param text - Source text the node must have; any text when omitted.
   * @param nth - 0-based position among the matching nodes; 0 when omitted.
   * @returns The matching node.
   */
  find<Type extends Node['type']>(
    type: Type,
    text?: string,
    nth?: number,
  ): { type: Type } & Node

  /**
   * Source code helpers, as `context.sourceCode`.
   */
  sourceCode: SourceCode

  /**
   * Questions about the syntactic position of nodes, as `context.syntax`.
   */
  syntax: SyntaxHelpers

  /**
   * Scope analysis of the snippet.
   */
  scopes: ScopeAnalysis

  /**
   * Parsed snippet.
   */
  parsed: ParsedFile

  /**
   * Type hints of the syntactic provider, as `context.hints`.
   */
  hints: TypeHints

  /**
   * Runtime tree of the snippet.
   */
  tree: TreeIndex
}

/**
 * Parses a snippet and builds its runtime tree, scope analysis, source code,
 * syntax helpers and type hints. A snippet that does not parse fails the test.
 *
 * @param source - Text of the snippet.
 * @param file - File name, whose extension selects the language.
 * @returns The parsed snippet with its helpers and a node finder.
 * @throws Error - When the snippet has a parse error.
 */
export function createTestFile(source: string, file = 'example.ts'): TestFile {
  let outcome = parseFile(file, source)
  if (outcome.kind === 'failed') {
    throw new Error(
      `Snippet does not parse: ${outcome.diagnostics
        .map(diagnostic => diagnostic.message)
        .join(' ')}`,
    )
  }

  let { parsed } = outcome
  let tree = indexTree(parsed.program)
  let scopes = analyzeScopes(parsed.program)
  return {
    find<Type extends Node['type']>(
      type: Type,
      text?: string,
      nth = 0,
    ): { type: Type } & Node {
      let matches: ({ type: Type } & Node)[] = []
      walkTree(parsed.program, node => {
        if (
          isOfType(node, type) &&
          (text === undefined ||
            parsed.text.slice(node.start, node.end) === text)
        ) {
          matches.push(node)
        }
        return true
      })
      let match = matches[nth]
      if (!match) {
        throw new Error(
          `No ${type} node number ${nth} with the text ${String(text)}.`,
        )
      }
      return match
    },
    hints: createTypeHints(createSyntacticTypeProvider(parsed, tree, scopes)),
    sourceCode: createSourceCode(parsed, tree, scopes),
    syntax: createSyntaxHelpers(tree, scopes),
    parsed,
    scopes,
    tree,
  }
}

/**
 * Tells whether a node has a type.
 *
 * @param node - Node to check.
 * @param type - Expected node type.
 * @returns Whether the node is of the type.
 */
function isOfType<Type extends Node['type']>(
  node: Node,
  type: Type,
): node is { type: Type } & Node {
  return node.type === type
}
