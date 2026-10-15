import type {
  TSModuleDeclaration,
  VariableDeclarator,
  IdentifierName,
  PropertyKey,
  Node,
} from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Expressions that name the declaration around their body when they are the
 * value of a variable, property or assignment.
 */
let functionValueTypes = new Set<string>([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'ClassExpression',
])

/**
 * Builds the dotted names of the declarations around a node, such as
 * `Calculator.add`: functions, classes, class members, function-valued
 * properties and assignments, namespaces, module-level variables and default
 * exports. Segments come from names only, never from source text, so the path
 * does not change with formatting, comments or line endings.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree; its own name is not part of the path.
 * @returns Segments of the enclosing declarations, outermost first, joined with
 *   dots, or null at the top level of the file.
 */
export function getScopePath(tree: TreeIndex, node: Node): string | null {
  let segments: string[] = []
  let slot = tree.slots.get(node)!
  while (slot.parent) {
    let segment = getSegment(tree, slot.parent)
    if (segment !== null) {
      segments.unshift(segment)
    }
    slot = tree.slots.get(slot.parent)!
  }
  return segments.length > 0 ? segments.join('.') : null
}

/**
 * Finds the segment an ancestor contributes to the scope path.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Ancestor of the node whose path is built.
 * @returns Name of the declaration the ancestor makes, or null when it makes
 *   none.
 */
function getSegment(tree: TreeIndex, node: Node): string | null {
  switch (node.type) {
    case 'ExportDefaultDeclaration':
      return (
          node.declaration.type === 'FunctionDeclaration' ||
            node.declaration.type === 'ClassDeclaration'
        ) ?
          null
        : 'default'
    case 'AssignmentExpression':
      return isFunctionValue(node.right) ? getChainName(node.left) : null
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return node.id?.name ?? 'default'
    case 'TSModuleDeclaration':
      return getModuleName(node.id)
    case 'PropertyDefinition':
    case 'AccessorProperty':
      return node.computed ? null : getKeyName(node.key)
    case 'FunctionExpression':
    case 'ClassExpression':
      return node.id?.name ?? null
    case 'VariableDeclarator':
      return getDeclaratorName(tree, node)
    case 'MethodDefinition':
      return node.computed ? null : getAccessorName(node.kind, node.key)
    case 'Property':
      return getPropertyName(node)
    default:
      return null
  }
}

/**
 * Names an assignment target made of identifiers, `this` and non-computed
 * member accesses, such as `Foo.prototype.bar`.
 *
 * @param node - Left side of an assignment or a part of it.
 * @returns Dotted chain, or null for any other target.
 */
function getChainName(node: Node): string | null {
  let target = unwrapParentheses(node)
  switch (target.type) {
    case 'MemberExpression': {
      if (target.computed || target.property.type !== 'Identifier') {
        return null
      }
      let object = getChainName(target.object)
      return object === null ? null : `${object}.${target.property.name}`
    }
    case 'ThisExpression':
      return 'this'
    case 'Identifier':
      return target.name
    default:
      return null
  }
}

/**
 * Tells whether a declarator belongs to a declaration in the body of the
 * program or of a namespace, possibly exported.
 *
 * @param tree - Runtime tree of the file.
 * @param declarator - Declarator to check.
 * @returns Whether the variable is declared at module level.
 */
function isModuleLevel(
  tree: TreeIndex,
  declarator: VariableDeclarator,
): boolean {
  let declaration = tree.slots.get(declarator)!.parent!
  let slot = tree.slots.get(declaration)!
  let container = slot.parent!
  if (container.type === 'ExportNamedDeclaration') {
    slot = tree.slots.get(container)!
    container = slot.parent!
  }
  return (
    slot.key === 'body' &&
    (container.type === 'Program' || container.type === 'TSModuleBlock')
  )
}

/**
 * Names a variable declarator whose value is a function or class, or that is
 * declared at module level.
 *
 * @param tree - Runtime tree of the file.
 * @param declarator - Declarator around the node.
 * @returns Name of the variable, or null for destructuring and for local
 *   variables that hold other values.
 */
function getDeclaratorName(
  tree: TreeIndex,
  declarator: VariableDeclarator,
): string | null {
  if (declarator.id.type !== 'Identifier') {
    return null
  }
  if (
    (declarator.init !== null && isFunctionValue(declarator.init)) ||
    isModuleLevel(tree, declarator)
  ) {
    return declarator.id.name
  }
  return null
}

/**
 * Names an object property that is a method or an accessor or holds a function
 * or class.
 *
 * @param property - Property of an object literal or pattern.
 * @returns Name of the property, or null for a computed key or a property that
 *   holds another value.
 */
function getPropertyName(
  property: Extract<Node, { type: 'Property' }>,
): string | null {
  if (
    property.computed ||
    (!property.method &&
      property.kind === 'init' &&
      !isFunctionValue(property.value))
  ) {
    return null
  }
  return getAccessorName(property.kind, property.key)
}

/**
 * Joins the names of a namespace id such as `Space.Inner`.
 *
 * @param name - Id of a namespace that is not ambient, or a part of it. Quoted
 *   names exist only on ambient modules, which the runtime tree leaves out.
 * @returns Names joined with dots.
 */
function getModuleName(
  name: TSModuleDeclaration['id'] | IdentifierName,
): string {
  if (name.type === 'TSQualifiedName') {
    return `${getModuleName(name.left as TSModuleDeclaration['id'])}.${name.right.name}`
  }
  return (name as IdentifierName).name
}

/**
 * Reads the name of a non-computed key.
 *
 * @param key - Identifier, private name, string, number or bigint literal.
 * @returns Identifier name, `#name` for a private name, or the literal value as
 *   a string; for a bigint that is its decimal digits.
 */
function getKeyName(key: PropertyKey): string {
  if (key.type === 'PrivateIdentifier') {
    return `#${key.name}`
  }
  if (key.type === 'Literal') {
    return String(key.value)
  }
  return (key as IdentifierName).name
}

/**
 * Names a method, property or accessor by its key, with the accessor kind and a
 * space in front of a getter or setter name.
 *
 * @param kind - Kind of the member, such as `get` or `method`.
 * @param key - Non-computed key of the member.
 * @returns Key name, such as `size`, `get size` or `set size`.
 */
function getAccessorName(kind: string, key: PropertyKey): string {
  let name = getKeyName(key)
  return kind === 'get' || kind === 'set' ? `${kind} ${name}` : name
}

/**
 * Tells whether an expression, through parentheses and TypeScript wrappers, is
 * a function, arrow function or class.
 *
 * @param node - Value of a declarator, property or assignment.
 * @returns Whether the value names the declaration around its body.
 */
function isFunctionValue(node: Node): boolean {
  return functionValueTypes.has(unwrapExpression(node).type)
}
