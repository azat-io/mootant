import type { Node } from 'oxc-parser'

import type { Replacement } from './replacement'

/**
 * Functions keyed by ESTree node type. The walker calls a function for every
 * runtime node of that type with the node and its parent, skipping parentheses,
 * and collects the returned replacements.
 */
export type MutatorVisitors = {
  [Type in Node['type']]?: (
    node: NodeOfType<Node, Type>,
    parent: Node | null,
  ) => readonly Replacement[]
}

/**
 * Members of the node union whose `type` can be the given type. Some oxc node
 * interfaces, such as `Function` and `Class`, carry a union of types.
 */
type NodeOfType<Candidate, Type> =
  Candidate extends { type: infer Kind } ?
    Type extends Kind ?
      Candidate
    : never
  : never
