import type { Node } from 'oxc-parser'

import type { TypeHintProvider } from '../../types/type-hint-provider'
import type { ScopeAnalysis } from '../../types/scope-analysis'
import type { TypeInference } from '../../types/type-inference'
import type { InferredType } from '../../types/inferred-type'
import type { ParsedFile } from '../../types/parsed-file'
import type { TreeIndex } from '../../types/tree-index'

import { inferAnnotationType } from './infer-annotation-type'
import { inferExpressionType } from './infer-expression-type'
import { createInferredType } from './create-inferred-type'

/**
 * Node whose inference is under way on the explicit stack of `getType`.
 */
interface InferenceFrame {
  /**
   * Whether the operands of the node are already on the stack.
   */
  expanded: boolean

  /**
   * Node being inferred.
   */
  node: Node
}

/**
 * Builds the type provider of one file from its syntax alone. Results are
 * memoized per node; a node asked again while its inference is in progress, as
 * in `let a = b; let b = a`, is unknown, and that answer is not cached. The
 * operands of operators, conditionals, sequences and parentheses are inferred
 * on an explicit stack before the node that reads them, so a long chain such as
 * `a + b + ... + z` never exhausts the call stack.
 *
 * @param parsed - Parsed file, for its language.
 * @param tree - Runtime tree of the file.
 * @param scopes - Scope analysis of the file.
 * @returns A provider that never throws: nodes outside the runtime tree, and
 *   nodes it does not understand, are unknown.
 */
export function createSyntacticTypeProvider(
  parsed: ParsedFile,
  tree: TreeIndex,
  scopes: ScopeAnalysis,
): TypeHintProvider {
  let annotationTypes = new WeakMap<Node, InferredType>()
  let types = new WeakMap<Node, InferredType>()
  let pending = new Set<Node>()

  /**
   * Infers an expression of the runtime tree with memoization and the cycle
   * guard.
   *
   * @param node - Expression to infer.
   * @returns Kinds of the expression, or unknown.
   */
  function getType(node: Node): InferredType {
    let cached = types.get(node)
    if (cached) {
      return cached
    }
    if (!tree.slots.has(node) || pending.has(node)) {
      return createInferredType(null)
    }
    let stack: InferenceFrame[] = [{ expanded: false, node }]
    let started: Node[] = []
    try {
      let frame = stack.at(-1)
      while (frame) {
        if (frame.expanded) {
          stack.pop()
          let type = inferExpressionType(frame.node, inference)
          pending.delete(frame.node)
          types.set(frame.node, type)
        } else {
          frame.expanded = true
          pending.add(frame.node)
          started.push(frame.node)
          let operands = getOperands(frame.node).filter(
            operand =>
              tree.slots.has(operand) &&
              !types.has(operand) &&
              !pending.has(operand),
          )
          stack.push(
            ...operands.toReversed().map(operand => ({
              expanded: false,
              node: operand,
            })),
          )
        }
        frame = stack.at(-1)
      }
    } finally {
      for (let startedNode of started) {
        pending.delete(startedNode)
      }
    }
    return types.get(node)!
  }

  let inference: TypeInference = {
    language: parsed.language,
    infer: getType,
    scopes,
    tree,
  }

  return {
    getAnnotationType(typeNode: Node): InferredType {
      let cached = annotationTypes.get(typeNode)
      if (cached) {
        return cached
      }
      let type = inferAnnotationType(typeNode, inference)
      annotationTypes.set(typeNode, type)
      return type
    },
    getType,
  }
}

/**
 * Lists the operands that the inference of a node reads before the node itself
 * and that can nest without bound: both sides of a binary or logical
 * expression, the right side of an assignment, both branches of a conditional,
 * the last expression of a sequence and the expression of parentheses, in the
 * order the inference reads them.
 *
 * @param node - Expression of the runtime tree.
 * @returns The operands, or nothing for other nodes.
 */
function getOperands(node: Node): Node[] {
  switch (node.type) {
    case 'ParenthesizedExpression':
      return [node.expression]
    case 'ConditionalExpression':
      return [node.consequent, node.alternate]
    case 'AssignmentExpression':
      return [node.right]
    case 'SequenceExpression':
      return [node.expressions.at(-1)!]
    case 'LogicalExpression':
    case 'BinaryExpression':
      return [node.left, node.right]
    default:
      return []
  }
}
