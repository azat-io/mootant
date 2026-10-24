/**
 * Node of the HTML tree that the docs plugins change. The docs do not depend on
 * the `hast` types, so it lists only the fields the plugins use.
 */
export interface HastNode {
  properties?: Record<string, unknown>
  children?: HastNode[]
  tagName?: string
  value?: string
  type: string
}

/**
 * Replaces every node that `test` accepts with the node that `wrap` builds
 * around it, and searches the other nodes deeper.
 *
 * @param node - Node to search.
 * @param test - Tells whether a node should be wrapped.
 * @param wrap - Builds the node that takes the place of an accepted one.
 */
export function wrapElements(
  node: HastNode,
  test: (child: HastNode) => boolean,
  wrap: (child: HastNode) => HastNode,
): void {
  let children = node.children ?? []
  for (let [index, child] of children.entries()) {
    if (test(child)) {
      children[index] = wrap(child)
    } else {
      wrapElements(child, test, wrap)
    }
  }
}
