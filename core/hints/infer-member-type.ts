import type { MemberExpression, ClassBody, Node } from 'oxc-parser'

import type { TypeInference } from '../../types/hints/type-inference'
import type { InferredType } from '../../types/hints/inferred-type'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { ThisClass } from './find-this-class'

import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { inferAnnotationType } from './infer-annotation-type'
import { unionInferredTypes } from './union-inferred-types'
import { createInferredType } from './create-inferred-type'
import { getContextSlot } from '../tree/get-context-slot'
import { inferBindingType } from './infer-binding-type'
import { findThisClass } from './find-this-class'
import { walkTree } from '../tree/walk-tree'

/**
 * How an occurrence of `this.name` uses the field.
 */
interface FieldUse {
  /**
   * Whether the occurrence assigns the field in a way that is not a plain `=`:
   * a compound or logical assignment, an update, a destructuring target or a
   * loop head.
   */
  isUnknownWrite: boolean

  /**
   * Right side of a plain `=` assignment to the field, or null.
   */
  value: Node | null

  /**
   * Whether the occurrence is the operand of `delete`, which leaves the field
   * undefined.
   */
  isDelete: boolean
}

/**
 * Class member that declares a field.
 */
type Field = Extract<
  Node,
  {
    type:
      'TSAbstractPropertyDefinition' | 'PropertyDefinition' | 'AccessorProperty'
  }
>

/**
 * Class members that declare a field.
 */
let fieldTypes = new Set<string>([
  'TSAbstractPropertyDefinition',
  'PropertyDefinition',
  'AccessorProperty',
])

/**
 * Occurrences of `this.name` and `this.#name` in each class body of a runtime
 * tree, by name in source order, so a class is walked once for all its fields.
 */
let fieldUses = new WeakMap<
  TreeIndex,
  WeakMap<ClassBody, Map<string, MemberExpression[]>>
>()

/**
 * Infers a member expression: `.length` of any receiver, and `this.name` or
 * `this.#name` from the field the enclosing class declares.
 *
 * @param node - Member expression.
 * @param inference - Recursion context of the provider.
 * @returns `number` for `.length`, the field's type for a field of `this`, or
 *   unknown.
 */
export function inferMemberType(
  node: MemberExpression,
  inference: TypeInference,
): InferredType {
  let name = getPropertyName(node)
  if (name === 'length') {
    return createInferredType(['number'])
  }
  if (
    name === null ||
    unwrapParentheses(node.object).type !== 'ThisExpression'
  ) {
    return createInferredType(null)
  }
  let owner = findThisClass(inference.tree, node)
  return owner ?
      inferFieldType(owner, name, inference)
    : createInferredType(null)
}

/**
 * Tells how an occurrence of `this.name` uses the field.
 *
 * @param tree - Runtime tree of the file.
 * @param member - Member expression on `this`.
 * @returns The assigned value of a plain `=`, whether the field is deleted,
 *   whether another kind of write happens, or none of them for a read.
 */
function getFieldUse(tree: TreeIndex, member: Node): FieldUse {
  let { parent, key } = getContextSlot(tree, member)
  let isTarget = key === 'left'
  let user = parent!
  switch (user.type) {
    case 'AssignmentExpression':
      if (isTarget && user.operator === '=') {
        return { isUnknownWrite: false, value: user.right, isDelete: false }
      }
      return { isUnknownWrite: isTarget, isDelete: false, value: null }
    case 'AssignmentPattern':
    case 'ForOfStatement':
    case 'ForInStatement':
      return { isUnknownWrite: isTarget, isDelete: false, value: null }
    case 'UpdateExpression':
    case 'ArrayPattern':
    case 'RestElement':
      return { isUnknownWrite: true, isDelete: false, value: null }
    case 'UnaryExpression':
      return {
        isDelete: user.operator === 'delete',
        isUnknownWrite: false,
        value: null,
      }
    case 'Property':
      return {
        isUnknownWrite:
          key === 'value' &&
          getContextSlot(tree, user).parent!.type === 'ObjectPattern',
        isDelete: false,
        value: null,
      }
    default:
      return { isUnknownWrite: false, isDelete: false, value: null }
  }
}

/**
 * Infers the type of a field of `this`: its annotation, or the union of its
 * initializer, every plain assignment to it in the class and `undefined` when
 * the class deletes it; a constructor parameter property has its parameter's
 * type.
 *
 * @param owner - Class that `this` refers to.
 * @param name - Field name, `#name` for a private field.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the field, or unknown when no field is declared or a write
 *   cannot be analyzed.
 */
function inferFieldType(
  owner: ThisClass,
  name: string,
  inference: TypeInference,
): InferredType {
  for (let element of owner.body.body) {
    if (
      element.type === 'MethodDefinition' &&
      element.kind === 'constructor' &&
      !owner.isStatic
    ) {
      for (let parameter of element.value.params) {
        if (parameter.type === 'TSParameterProperty') {
          let identifier =
            parameter.parameter.type === 'AssignmentPattern' ?
              parameter.parameter.left
            : parameter.parameter
          if (getKeyName(identifier) === name) {
            return inferBindingType(
              inference.scopes.bindings.get(identifier)!,
              inference,
            )
          }
        }
      }
    }
    if (
      isField(element) &&
      element.static === owner.isStatic &&
      !element.computed &&
      getKeyName(element.key) === name
    ) {
      return inferDeclaredFieldType(element, owner, inference)
    }
  }
  return createInferredType(null)
}

/**
 * Infers a declared field from its annotation, or from its initializer and the
 * assignments of the class.
 *
 * @param field - Field declaration.
 * @param owner - Class that `this` refers to.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the field, or unknown.
 */
function inferDeclaredFieldType(
  field: Field,
  owner: ThisClass,
  inference: TypeInference,
): InferredType {
  let name = getKeyName(field.key)
  if (field.typeAnnotation) {
    let type = inferAnnotationType(field.typeAnnotation, inference)
    return field.optional ?
        unionInferredTypes([type, createInferredType(['undefined'])])
      : type
  }
  let types = [
    field.value ?
      inference.infer(field.value)
    : createInferredType(['undefined']),
  ]
  for (let node of getFieldUses(inference.tree, owner.body, name!)) {
    let use = getFieldUse(inference.tree, node)
    if (isSameClass(findThisClass(inference.tree, node), owner)) {
      if (use.isUnknownWrite) {
        types.push(createInferredType(null))
      } else if (use.value) {
        types.push(inference.infer(use.value))
      } else if (use.isDelete) {
        types.push(createInferredType(['undefined']))
      }
    }
  }
  return unionInferredTypes(types)
}

/**
 * Lists the occurrences of a field name on `this` in a class body, nested
 * classes and functions included, walking the body once for all names.
 *
 * @param tree - Runtime tree of the file.
 * @param body - Class body to search.
 * @param name - Field name, `#name` for a private field, that a member of the
 *   body reads.
 * @returns Member expressions on `this` with that name, in source order, the
 *   read itself included.
 */
function getFieldUses(
  tree: TreeIndex,
  body: ClassBody,
  name: string,
): MemberExpression[] {
  let bodies = fieldUses.get(tree)
  if (!bodies) {
    bodies = new WeakMap()
    fieldUses.set(tree, bodies)
  }
  let uses = bodies.get(body)
  if (!uses) {
    let found = new Map<string, MemberExpression[]>()
    walkTree(body, node => {
      if (!tree.slots.has(node)) {
        return false
      }
      let key =
        (
          node.type === 'MemberExpression' &&
          unwrapParentheses(node.object).type === 'ThisExpression'
        ) ?
          getPropertyName(node)
        : null
      if (key !== null) {
        let list = found.get(key) ?? []
        list.push(node as MemberExpression)
        found.set(key, list)
      }
      return true
    })
    bodies.set(body, found)
    uses = found
  }
  return uses.get(name)!
}

/**
 * Reads the property name of a non-computed member expression.
 *
 * @param node - Member expression.
 * @returns The name, `#name` for a private name, `length` also for the computed
 *   string `'length'`, or null for another computed property.
 */
function getPropertyName(node: MemberExpression): string | null {
  if (node.computed) {
    let { property } = node
    return property.type === 'Literal' && property.value === 'length' ?
        'length'
      : null
  }
  return getKeyName(node.property)
}

/**
 * Reads the name of an identifier or a private name.
 *
 * @param key - Key or property node.
 * @returns The name, `#name` for a private name, or null for another node.
 */
function getKeyName(key: Node): string | null {
  switch (key.type) {
    case 'PrivateIdentifier':
      return `#${key.name}`
    case 'Identifier':
      return key.name
    default:
      return null
  }
}

/**
 * Tells whether two occurrences of `this` refer to the same class in the same
 * role.
 *
 * @param found - Class found for an occurrence, or null.
 * @param owner - Class of the field being inferred.
 * @returns Whether both are the same class body with the same static flag.
 */
function isSameClass(found: ThisClass | null, owner: ThisClass): boolean {
  return found?.body === owner.body && found.isStatic === owner.isStatic
}

/**
 * Tells whether a class member declares a field.
 *
 * @param element - Member of a class body.
 * @returns Whether the member is a field, an accessor field or an abstract
 *   field.
 */
function isField(element: Node): element is Field {
  return fieldTypes.has(element.type)
}
