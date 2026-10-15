import type { NodeSlot } from '../../types/syntax/node-slot'

/**
 * Tells whether a slot holds a name that is never a value: a non-computed key
 * of a property or class member, a non-computed member property, a label, a
 * part of `new.target` or `import.meta`, or an enum member name.
 *
 * @param slot - Raw slot of a node.
 * @returns Whether the node in the slot is a name rather than a value.
 */
export function isNamePosition(slot: NodeSlot): boolean {
  let { parent, key } = slot
  switch (parent?.type) {
    case 'TSAbstractPropertyDefinition':
    case 'TSAbstractMethodDefinition':
    case 'TSAbstractAccessorProperty':
    case 'PropertyDefinition':
    case 'MethodDefinition':
    case 'AccessorProperty':
    case 'Property':
      return key === 'key' && !parent.computed
    case 'MemberExpression':
      return key === 'property' && !parent.computed
    case 'TSEnumMember':
      return key === 'id'
    case 'MetaProperty':
      return true
    default:
      return key === 'label'
  }
}
