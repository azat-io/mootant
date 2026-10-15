import type { ThisExpression } from 'oxc-parser'

import type { TypeInference } from '../../types/hints/type-inference'
import type { InferredType } from '../../types/hints/inferred-type'

import { createInferredType } from './create-inferred-type'

/**
 * Infers `this` from the code that binds it, crossing arrow functions: the
 * class itself in a static method, static block or static field initializer, an
 * object in an instance member or an object literal method, `undefined` at the
 * top level of an ES module and an object at the top level of a script or a
 * CommonJS file.
 *
 * @param node - `this` expression.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of `this`, or unknown inside a plain function, whose `this`
 *   depends on the call.
 */
export function inferThisType(
  node: ThisExpression,
  inference: TypeInference,
): InferredType {
  let { slots } = inference.tree
  let slot = slots.get(node)!
  let parent = slot.parent!
  while (parent.type !== 'Program') {
    switch (parent.type) {
      case 'FunctionDeclaration':
        return createInferredType(null)
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (slot.key === 'value') {
          return createInferredType([parent.static ? 'function' : 'object'])
        }
        break
      case 'FunctionExpression': {
        let owner = slots.get(parent)!.parent!
        if (owner.type === 'MethodDefinition') {
          return createInferredType([owner.static ? 'function' : 'object'])
        }
        return createInferredType(
          owner.type === 'Property' && (owner.method || owner.kind !== 'init') ?
            ['object']
          : null,
        )
      }
      case 'StaticBlock':
        return createInferredType(['function'])
      default:
        break
    }
    slot = slots.get(parent)!
    parent = slot.parent!
  }
  return createInferredType([
    parent.sourceType === 'module' ? 'undefined' : 'object',
  ])
}
