import type { HastNode } from './wrap-elements'

/**
 * Returns the text of a node.
 *
 * @param node - Node to read.
 * @returns Text of the node and its children.
 */
export function getText(node: HastNode): string {
  return (
    node.value ?? (node.children ?? []).map(child => getText(child)).join('')
  )
}
