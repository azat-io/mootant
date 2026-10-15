import type { ClassBody, Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

/**
 * Class whose instance or constructor `this` refers to.
 */
export interface ThisClass {
  /**
   * Whether `this` is the class itself: a static member or a static block.
   */
  isStatic: boolean

  /**
   * Body of the class.
   */
  body: ClassBody
}

/**
 * Finds the class that `this` refers to at a node, crossing arrow functions
 * only.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node that uses `this`.
 * @returns The class and whether `this` is the class itself, or null when
 *   `this` belongs to a plain function or to the top level.
 */
export function findThisClass(tree: TreeIndex, node: Node): ThisClass | null {
  let slot = tree.slots.get(node)!
  while (slot.parent) {
    let { parent, key } = slot
    switch (parent.type) {
      case 'FunctionDeclaration':
        return null
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (key === 'value') {
          return getMemberClass(tree, parent, parent.static)
        }
        break
      case 'FunctionExpression': {
        let method = tree.slots.get(parent)!.parent!
        return method.type === 'MethodDefinition' ?
            getMemberClass(tree, method, method.static)
          : null
      }
      case 'StaticBlock':
        return getMemberClass(tree, parent, true)
      default:
        break
    }
    slot = tree.slots.get(parent)!
  }
  return null
}

/**
 * Reads the class body that holds a class member.
 *
 * @param tree - Runtime tree of the file.
 * @param member - Method, field, accessor or static block.
 * @param isStatic - Whether the member is static.
 * @returns The class body and the static flag.
 */
function getMemberClass(
  tree: TreeIndex,
  member: Node,
  isStatic: boolean,
): ThisClass {
  let body = tree.slots.get(member)!.parent as ClassBody
  return { isStatic, body }
}
