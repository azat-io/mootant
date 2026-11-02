import type { HastNode } from './wrap-elements'

/**
 * Returns the child elements of a node, without the text between them.
 *
 * @param node - Parent node, if any.
 * @returns Child elements.
 */
export function getElements(node: undefined | HastNode): HastNode[] {
  return (node?.children ?? []).filter(child => child.type === 'element')
}
