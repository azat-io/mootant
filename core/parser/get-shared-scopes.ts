import type { Program, Node } from 'oxc-parser'

import type { TemplateExpression } from '../../types/source/template-expression'

import { getComponentFramework } from './get-component-framework'

/**
 * Finds the scopes of a program whose names code outside the scope may read and
 * write where the scope analysis of the program does not see it. A component
 * shares the top level of each of its programs, a script block or the template,
 * with its other programs and its parent: the template uses the names of the
 * script blocks, the script blocks of one component share their names, and a
 * parent passes the props of a Svelte component. A Svelte declaration tag, such
 * as a `@const` tag, declares names for the part of the template around it, but
 * the synthetic module of the template holds every piece of template code as
 * one statement, in source order, and the code of a declaration tag in a block
 * of its own, so that block is shared too. A JavaScript or TypeScript file
 * shares no scope.
 *
 * @param file - Path of the file, whose extension tells the framework.
 * @param program - Program of the file: the whole file, a script block or the
 *   template.
 * @param expressions - Template code the program holds, in source order, or
 *   null for a script.
 * @returns The program and the blocks of its declaration tags for a component,
 *   or no scope.
 */
export function getSharedScopes(
  file: string,
  program: Program,
  expressions: readonly TemplateExpression[] | null,
): ReadonlySet<Node> {
  if (getComponentFramework(file) === null) {
    return new Set()
  }
  let shared = new Set<Node>([program])
  let pieces = expressions ?? []
  for (let [index, expression] of pieces.entries()) {
    if (expression.wrap === 'declaration') {
      shared.add(program.body[index]!)
    }
  }
  return shared
}
