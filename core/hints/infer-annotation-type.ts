import type {
  TSTypeParameterDeclaration,
  TSInterfaceDeclaration,
  TSIntersectionType,
  TSEnumDeclaration,
  TSTypeReference,
  TSSignature,
  Node,
} from 'oxc-parser'

import type { TypeInference } from '../../types/hints/type-inference'
import type { InferredType } from '../../types/hints/inferred-type'
import type { ValueKind } from '../../types/hints/value-kind'

import { inferExpressionType } from './infer-expression-type'
import { unionInferredTypes } from './union-inferred-types'
import { createInferredType } from './create-inferred-type'
import { NON_NULLISH_KINDS } from './non-nullish-kinds'
import { inferBindingType } from './infer-binding-type'
import { OBJECT_KINDS } from './object-kinds'

/**
 * Node that declares type parameters.
 */
interface TypeParameterOwner {
  /**
   * Type parameters the node declares.
   */
  typeParameters: TSTypeParameterDeclaration
}

/**
 * Kinds of standard type names that take no part of their type arguments.
 * `Object`, like `{}`, allows every value but `null` and `undefined`.
 */
let standardTypes = new Map<string, readonly ValueKind[]>([
  ['Object', NON_NULLISH_KINDS],
  ['ReadonlyArray', ['array']],
  ['PromiseLike', ['promise']],
  ['ReadonlyMap', ['object']],
  ['ReadonlySet', ['object']],
  ['Function', ['function']],
  ['Required', ['object']],
  ['Boolean', ['boolean']],
  ['Promise', ['promise']],
  ['Partial', ['object']],
  ['WeakMap', ['object']],
  ['WeakSet', ['object']],
  ['Record', ['object']],
  ['RegExp', ['object']],
  ['String', ['string']],
  ['Number', ['number']],
  ['Error', ['object']],
  ['Array', ['array']],
  ['Date', ['object']],
  ['Pick', ['object']],
  ['Omit', ['object']],
  ['Map', ['object']],
  ['Set', ['object']],
])

/**
 * Types of the members of an intersection that decide its kind on their own.
 */
let primitiveTypes = new Set<string>([
  'TSTemplateLiteralType',
  'TSBooleanKeyword',
  'TSStringKeyword',
  'TSNumberKeyword',
  'TSBigIntKeyword',
  'TSSymbolKeyword',
  'TSLiteralType',
])

/**
 * Type references and type queries being resolved, so that recursive aliases,
 * constraints and `typeof` queries end as unknown instead of looping.
 */
let pendingTypes = new Set<Node>()

/**
 * Infers the kinds of a TypeScript type node. Type names resolve to type
 * parameters in scope, same-file declarations in scope and standard names; a
 * name declared elsewhere is unknown, because it may stand for any type, `null`
 * and `undefined` included.
 *
 * @param type - Type node, or the TSTypeAnnotation wrapper around one.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the type allows, or unknown.
 */
export function inferAnnotationType(
  type: Node,
  inference: TypeInference,
): InferredType {
  let current = type
  while (
    current.type === 'TSParenthesizedType' ||
    current.type === 'TSTypeAnnotation'
  ) {
    current = current.typeAnnotation
  }
  switch (current.type) {
    case 'TSTemplateLiteralType':
    case 'TSStringKeyword':
      return createInferredType(['string'])
    case 'TSIntersectionType':
      return inferIntersectionType(current, inference)
    case 'TSUndefinedKeyword':
    case 'TSVoidKeyword':
      return createInferredType(['undefined'])
    case 'TSConstructorType':
    case 'TSFunctionType':
      return createInferredType(['function'])
    case 'TSBooleanKeyword':
      return createInferredType(['boolean'])
    case 'TSNumberKeyword':
      return createInferredType(['number'])
    case 'TSBigIntKeyword':
      return createInferredType(['bigint'])
    case 'TSSymbolKeyword':
      return createInferredType(['symbol'])
    case 'TSObjectKeyword':
      return createInferredType(OBJECT_KINDS)
    case 'TSTypePredicate':
      return createInferredType([current.asserts ? 'undefined' : 'boolean'])
    case 'TSTypeReference':
    case 'TSTypeQuery':
      return inferGuardedType(current, inference)
    case 'TSTypeOperator':
      return inferTypeOperator(
        current.operator,
        current.typeAnnotation,
        inference,
      )
    case 'TSTypeLiteral':
      return inferMembersType(current.members, false)
    case 'TSLiteralType':
      return inferExpressionType(
        current.literal.type === 'UnaryExpression' ?
          current.literal.argument
        : current.literal,
        inference,
      )
    case 'TSNullKeyword':
      return createInferredType(['null'])
    case 'TSMappedType':
      return createInferredType(['object'])
    case 'TSUnionType':
      return unionInferredTypes(
        current.types.map(member => inferAnnotationType(member, inference)),
      )
    case 'TSTupleType':
    case 'TSArrayType':
      return createInferredType(['array'])
    default:
      return createInferredType(null)
  }
}

/**
 * Infers a type name: a type parameter in scope, a same-file declaration in
 * scope, a standard name, or a name declared elsewhere, which is unknown.
 *
 * @param type - Type reference whose name is resolved.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the type allows, or unknown.
 */
function inferReferenceType(
  type: TSTypeReference,
  inference: TypeInference,
): InferredType {
  let { typeArguments, typeName } = type
  if (typeName.type === 'Identifier') {
    let { name } = typeName
    let owner = findTypeParameterOwner(type, name, inference)
    if (owner) {
      return inferTypeParameter(owner, name, inference)
    }
    let declaration = inference.scopes.typeReferences.get(typeName)
    if (declaration) {
      return inferDeclaredType(declaration, inference)
    }
    if (name === 'NonNullable' || name === 'Readonly') {
      let argument = typeArguments?.params[0]
      if (!argument) {
        return createInferredType(null)
      }
      let argumentType = inferAnnotationType(argument, inference)
      return name === 'Readonly' ? argumentType : (
          createInferredType(
            argumentType.kinds?.filter(
              kind => kind !== 'null' && kind !== 'undefined',
            ) ?? null,
          )
        )
    }
    let kinds = standardTypes.get(name)
    if (kinds) {
      return createInferredType(kinds)
    }
  }
  return createInferredType(null)
}

/**
 * Infers an intersection: a primitive member decides it, as in `string & {
 * brand: 'id' }`. Otherwise every member must be object-like: a function member
 * makes it a function and an array member an array, as in `(() => void) & { id:
 * string }`; it is a plain object when the other members are plain objects.
 * Members that allow any object or any non-nullish value add nothing.
 *
 * @param type - Intersection whose members are read.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the intersection, or unknown.
 */
function inferIntersectionType(
  type: TSIntersectionType,
  inference: TypeInference,
): InferredType {
  let primitive = type.types.find(member => primitiveTypes.has(member.type))
  if (primitive) {
    return inferAnnotationType(primitive, inference)
  }
  let decided = new Set<ValueKind>()
  for (let member of type.types) {
    let { kinds } = inferAnnotationType(member, inference)
    if (kinds?.length === 1 && OBJECT_KINDS.includes(kinds[0]!)) {
      decided.add(kinds[0]!)
    } else if (!kinds || !allowsAnyObject(kinds)) {
      return createInferredType(null)
    }
  }
  let isObject = decided.delete('object')
  if (decided.size === 1) {
    return createInferredType([...decided])
  }
  return createInferredType(isObject && decided.size === 0 ? ['object'] : null)
}

/**
 * Infers an interface from its own members and the types it extends: an
 * extended `Function`, array or same-file interface that describes a function
 * or an array makes the interface one too, since it inherits the call signature
 * or the array members. An interface met again while it is being resolved adds
 * nothing.
 *
 * @param declaration - Interface whose members and extends clause are read.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the interface allows.
 */
function inferInterfaceType(
  declaration: TSInterfaceDeclaration,
  inference: TypeInference,
): InferredType {
  let own = inferMembersType(
    declaration.body.body,
    declaration.extends.length > 0,
  )
  if (own.kinds?.includes('function') || pendingTypes.has(declaration)) {
    return own
  }
  pendingTypes.add(declaration)
  try {
    for (let { expression } of declaration.extends) {
      let kinds = getHeritageKinds(expression, inference)
      if (
        kinds?.length === 1 &&
        (kinds[0] === 'function' || kinds[0] === 'array')
      ) {
        return createInferredType(kinds)
      }
    }
  } finally {
    pendingTypes.delete(declaration)
  }
  return own
}

/**
 * Infers a type reference or a type query, or gives unknown when the same node
 * is already being resolved further up.
 *
 * @param type - Type reference or type query.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the type allows, or unknown.
 */
function inferGuardedType(
  type: Extract<Node, { type: 'TSTypeReference' | 'TSTypeQuery' }>,
  inference: TypeInference,
): InferredType {
  if (pendingTypes.has(type)) {
    return createInferredType(null)
  }
  pendingTypes.add(type)
  try {
    if (type.type === 'TSTypeReference') {
      return inferReferenceType(type, inference)
    }
    let binding =
      type.exprName.type === 'Identifier' ?
        inference.scopes.bindings.get(type.exprName)
      : undefined
    return binding ?
        inferBindingType(binding, inference)
      : createInferredType(null)
  } finally {
    pendingTypes.delete(type)
  }
}

/**
 * Infers the type of an enum from the initializers of its members.
 *
 * @param declaration - Enum whose members are read.
 * @returns `number` when no member has a string initializer, `string` when all
 *   have, and both otherwise.
 */
function inferEnumType(declaration: TSEnumDeclaration): InferredType {
  let { members } = declaration.body
  let strings = members.filter(member => {
    let { initializer } = member
    return (
      initializer?.type === 'TemplateLiteral' ||
      (initializer?.type === 'Literal' && typeof initializer.value === 'string')
    )
  }).length
  if (strings === 0) {
    return createInferredType(['number'])
  }
  return createInferredType(
    strings === members.length ? ['string'] : ['number', 'string'],
  )
}

/**
 * Infers the type of a type parameter from its constraint. The parameters of a
 * type alias are unknown: the alias is resolved without its arguments.
 *
 * @param owner - Function, class or interface that declares the parameter.
 * @param name - Name of the parameter, as written in the reference.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the constraint, or unknown without one.
 */
function inferTypeParameter(
  owner: Node,
  name: string,
  inference: TypeInference,
): InferredType {
  if (owner.type === 'TSTypeAliasDeclaration') {
    return createInferredType(null)
  }
  let { typeParameters } = owner as TypeParameterOwner
  let { constraint } = typeParameters.params.find(
    parameter => parameter.name.name === name,
  )!
  return constraint ?
      inferAnnotationType(constraint, inference)
    : createInferredType(null)
}

/**
 * Infers the type that a same-file declaration names.
 *
 * @param declaration - Type alias, interface, class or enum.
 * @param inference - Recursion context of the provider.
 * @returns The alias's annotation type, the kinds of an interface's members,
 *   `object` for a class, or the kinds of an enum's members.
 */
function inferDeclaredType(
  declaration: Node,
  inference: TypeInference,
): InferredType {
  switch (declaration.type) {
    case 'TSTypeAliasDeclaration':
      return inferAnnotationType(declaration.typeAnnotation, inference)
    case 'TSInterfaceDeclaration':
      return inferInterfaceType(declaration, inference)
    case 'TSEnumDeclaration':
      return inferEnumType(declaration)
    default:
      return createInferredType(['object'])
  }
}

/**
 * Infers an object type literal or the body of an interface from its members: a
 * call or construct signature makes a function, no members at all allow any
 * value but `null` and `undefined`, and other members describe a plain object.
 *
 * @param members - Members of the literal or of the interface body.
 * @param isExtended - Whether the interface extends other types, which then add
 *   members of their own.
 * @returns Kinds of the values the type allows.
 */
function inferMembersType(
  members: readonly TSSignature[],
  isExtended: boolean,
): InferredType {
  if (
    members.some(
      member =>
        member.type === 'TSCallSignatureDeclaration' ||
        member.type === 'TSConstructSignatureDeclaration',
    )
  ) {
    return createInferredType(['function'])
  }
  return createInferredType(
    !isExtended && members.length === 0 ? NON_NULLISH_KINDS : ['object'],
  )
}

/**
 * Infers the kinds of a type that an interface extends.
 *
 * @param expression - Name in the extends clause.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of a standard name or a same-file declaration, or null.
 */
function getHeritageKinds(
  expression: Node,
  inference: TypeInference,
): readonly ValueKind[] | null {
  if (expression.type !== 'Identifier') {
    return null
  }
  let declaration = inference.scopes.typeReferences.get(expression)
  if (declaration) {
    return inferDeclaredType(declaration, inference).kinds
  }
  return standardTypes.get(expression.name) ?? null
}

/**
 * Infers a `keyof`, `unique` or `readonly` type operator.
 *
 * @param operator - Operator keyword.
 * @param operand - Type the operator applies to.
 * @param inference - Recursion context of the provider.
 * @returns Property key kinds for `keyof`, `symbol` for `unique symbol`, or the
 *   operand's kinds for `readonly`.
 */
function inferTypeOperator(
  operator: 'readonly' | 'unique' | 'keyof',
  operand: Node,
  inference: TypeInference,
): InferredType {
  switch (operator) {
    case 'unique':
      return createInferredType(['symbol'])
    case 'keyof':
      return createInferredType(['number', 'string', 'symbol'])
    default:
      return inferAnnotationType(operand, inference)
  }
}

/**
 * Finds the innermost node that declares a type parameter of the name and
 * contains the reference.
 *
 * @param type - Type reference.
 * @param name - Referenced name.
 * @param inference - Recursion context of the provider.
 * @returns The owner, or undefined when no type parameter of the name is in
 *   scope.
 */
function findTypeParameterOwner(
  type: Node,
  name: string,
  inference: TypeInference,
): undefined | Node {
  let owners = inference.scopes.typeParameters.get(name) ?? []
  return owners.findLast(
    owner => owner.start <= type.start && type.end <= owner.end,
  )
}

/**
 * Tells whether kinds are those of a type that allows any object: the `object`
 * keyword, or a type such as `{}` that allows any non-nullish value.
 *
 * @param kinds - Distinct kinds of a type.
 * @returns Whether the kinds are exactly the object kinds or the non-nullish
 *   kinds.
 */
function allowsAnyObject(kinds: readonly ValueKind[]): boolean {
  return [OBJECT_KINDS, NON_NULLISH_KINDS].some(
    allowed =>
      allowed.length === kinds.length &&
      allowed.every(kind => kinds.includes(kind)),
  )
}
