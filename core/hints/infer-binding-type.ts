import type {
  FormalParameterRest,
  VariableDeclarator,
  AssignmentPattern,
  BindingPattern,
  Node,
} from 'oxc-parser'

import type { TypeInference } from '../../types/type-inference'
import type { InferredType } from '../../types/inferred-type'
import type { ValueKind } from '../../types/value-kind'
import type { TreeIndex } from '../../types/tree-index'
import type { Binding } from '../../types/binding'

import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { inferAnnotationType } from './infer-annotation-type'
import { unionInferredTypes } from './union-inferred-types'
import { createInferredType } from './create-inferred-type'
import { NON_NULLISH_KINDS } from './non-nullish-kinds'
import { getAssertedType } from './get-asserted-type'
import { walkTree } from '../tree/walk-tree'

/**
 * Infers the type of a same-file name from its declaration: an annotation, an
 * initializer, a default value, or the kind of declaration. Writes after the
 * declaration are not read.
 *
 * @param binding - Declared name.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the name can hold, or unknown.
 */
export function inferBindingType(
  binding: Binding,
  inference: TypeInference,
): InferredType {
  switch (binding.kind) {
    case 'parameter':
      return inferParameterType(binding, inference)
    case 'namespace':
    case 'enum':
      return createInferredType(['object'])
    case 'function':
    case 'class':
      return createInferredType(['function'])
    case 'const':
    case 'using':
    case 'let':
    case 'var':
      return inferVariableType(binding, inference)
    default:
      return createInferredType(null)
  }
}

/**
 * Infers the type of a variable from its loop head, annotation or initializer.
 * A `let` or `var` keeps its initializer's kinds in TypeScript, where later
 * writes must conform. In JavaScript, where nothing stops a write of another
 * type, it adds `null`, `undefined` and the kinds of every write. In TypeScript
 * an asserted initializer gives the asserted type, which later writes must
 * conform to.
 *
 * @param binding - Binding declared by a variable declarator.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the variable can hold, or unknown.
 */
function inferVariableType(
  binding: Binding,
  inference: TypeInference,
): InferredType {
  let declarator = binding.declaration as VariableDeclarator
  let { init, id } = declarator
  if (id !== binding.identifier) {
    return createInferredType(null)
  }
  let head = getLoopHead(inference.tree, declarator)
  if (head) {
    return createInferredType(
      head.type === 'ForInStatement' ? ['string'] : null,
    )
  }
  if (id.typeAnnotation) {
    return inferAnnotationType(id.typeAnnotation, inference)
  }
  if (!init) {
    return createInferredType(null)
  }
  let type = inference.infer(init)
  if (binding.kind === 'const' || binding.kind === 'using') {
    return type
  }
  let kinds = type.kinds ?? []
  if (kinds.every(kind => kind === 'null' || kind === 'undefined')) {
    return createInferredType(null)
  }
  if (inference.language === 'javascript') {
    return unionInferredTypes([
      createInferredType([...kinds, 'null', 'undefined']),
      ...binding.writes.map(write => inferWriteType(write, kinds, inference)),
    ])
  }
  let value = unwrapParentheses(init)
  let asserted =
    value.type === 'TSAsExpression' || value.type === 'TSTypeAssertion' ?
      getAssertedType(value)
    : null
  if (asserted) {
    return inferAnnotationType(asserted, inference)
  }
  return value.type === 'ObjectExpression' && value.properties.length === 0 ?
      createInferredType(NON_NULLISH_KINDS)
    : type
}

/**
 * Infers the type of a parameter from its annotation, its default value or its
 * rest element.
 *
 * @param binding - Binding declared by a parameter.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the parameter can hold, or unknown.
 */
function inferParameterType(
  binding: Binding,
  inference: TypeInference,
): InferredType {
  let { declaration, identifier } = binding
  let parameter = (
    declaration.type === 'TSParameterProperty' ?
      declaration.parameter
    : declaration) as FormalParameterRest | BindingPattern
  switch (parameter.type) {
    case 'AssignmentPattern':
      if (parameter.left === identifier) {
        return inferDefaultedType(parameter, inference)
      }
      break
    case 'RestElement':
      if (parameter.argument === identifier) {
        return parameter.typeAnnotation ?
            inferAnnotationType(parameter.typeAnnotation, inference)
          : createInferredType(['array'])
      }
      break
    case 'Identifier':
      if (parameter.typeAnnotation) {
        let type = inferAnnotationType(parameter.typeAnnotation, inference)
        return (parameter as { optional?: boolean }).optional ?
            unionInferredTypes([type, createInferredType(['undefined'])])
          : type
      }
      return createInferredType(null)
    default:
      break
  }
  return inferDestructuredType(parameter, identifier)
}

/**
 * Infers the kinds a JavaScript write gives a variable. An `=` or a logical
 * assignment gives the kinds of its right side, `+=` a number, or also a string
 * when its right side is known to hold something else, any other compound
 * assignment and an update a number; each of them keeps a BigInt the variable
 * may hold. A destructuring or a loop head is unknown.
 *
 * @param write - Write of the variable, as recorded by the scope analysis.
 * @param kinds - Kinds of the initializer.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the written value, or unknown.
 */
function inferWriteType(
  write: Node,
  kinds: readonly ValueKind[],
  inference: TypeInference,
): InferredType {
  let numeric: ValueKind[] =
    kinds.includes('bigint') ? ['bigint', 'number'] : ['number']
  if (write.type === 'UpdateExpression') {
    return createInferredType(numeric)
  }
  if (
    write.type !== 'AssignmentExpression' ||
    write.left.type !== 'Identifier'
  ) {
    return createInferredType(null)
  }
  let { operator, right } = write
  switch (operator) {
    case '&&=':
    case '||=':
    case '??=':
    case '=':
      return inference.infer(right)
    case '+=':
      return createInferredType(
        mayConcatenate(inference.infer(right)) ?
          [...numeric, 'string']
        : numeric,
      )
    default:
      return createInferredType(numeric)
  }
}

/**
 * Infers the type of a parameter with a default value. Without an annotation it
 * is the default's type without `undefined` in TypeScript, where the compiler
 * checks what callers pass, and unknown in JavaScript, where the default says
 * nothing about the arguments.
 *
 * @param parameter - Parameter with a default value.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the parameter can hold, or unknown.
 */
function inferDefaultedType(
  parameter: AssignmentPattern,
  inference: TypeInference,
): InferredType {
  let { right, left } = parameter
  if (left.typeAnnotation) {
    return inferAnnotationType(left.typeAnnotation, inference)
  }
  if (inference.language === 'javascript') {
    return createInferredType(null)
  }
  let { kinds } = inference.infer(right)
  if (kinds === null) {
    return createInferredType(null)
  }
  return createInferredType(kinds.filter(kind => kind !== 'undefined'))
}

/**
 * Infers the type of a name inside a destructured parameter. Only rest elements
 * are known: an array rest is an array, an object rest an object.
 *
 * @param pattern - Destructuring pattern of the parameter.
 * @param identifier - Identifier that declares the name.
 * @returns `array` or `object` for a rest element, otherwise unknown.
 */
function inferDestructuredType(pattern: Node, identifier: Node): InferredType {
  let kinds: ValueKind[] = []
  walkTree(pattern, (node, slot) => {
    if (node.type === 'RestElement' && node.argument === identifier) {
      kinds.push(slot.parent!.type === 'ArrayPattern' ? 'array' : 'object')
    }
    return true
  })
  return createInferredType(kinds)
}

/**
 * Finds the loop whose head declares a variable.
 *
 * @param tree - Runtime tree of the file.
 * @param declarator - Variable declarator.
 * @returns The `for...in` or `for...of` statement whose `left` holds the
 *   declaration, or null.
 */
function getLoopHead(
  tree: TreeIndex,
  declarator: VariableDeclarator,
): Node | null {
  let declaration = tree.slots.get(declarator)?.parent
  if (!declaration) {
    return null
  }
  let { parent, key } = tree.slots.get(declaration)!
  return key === 'left' ? parent : null
}

/**
 * Tells whether the right side of a `+=` is known to hold a value that is not a
 * number or a BigInt, which turns the sum into a string. An unknown right side
 * leaves the sum numeric, so a numeric accumulator keeps its type.
 *
 * @param type - Inferred type of the right side.
 * @returns Whether some known kind is neither a number nor a BigInt.
 */
function mayConcatenate(type: InferredType): boolean {
  return (
    type.kinds?.some(kind => kind !== 'number' && kind !== 'bigint') === true
  )
}
