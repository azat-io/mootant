import type { ImportDeclaration, Program, Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { ImportedName } from '../../types/syntax/imported-name'

/**
 * Reads what a name declared by an import declaration of the file refers to:
 * the module and the exported name, `default` or `*`.
 *
 * @param scopes - Scope analysis of the file.
 * @param identifier - Identifier that refers to the name.
 * @returns The module and the exported name, or null when the identifier does
 *   not resolve to a value import of the file.
 */
export function readImport(
  scopes: ScopeAnalysis,
  identifier: Node,
): ImportedName | null {
  let binding = scopes.bindings.get(identifier)
  if (binding?.kind !== 'import') {
    return null
  }
  let specifier = binding.declaration
  /**
   * An import declaration sits in the Program; `import x = N.y` may sit in a
   * namespace body, which has a statement list too and no import declaration
   * with its node.
   */
  let { body } = binding.scope as Program
  let declaration = body.find(
    (statement): statement is ImportDeclaration =>
      statement.type === 'ImportDeclaration' &&
      (statement.specifiers as Node[]).includes(specifier),
  )
  if (declaration === undefined) {
    return null
  }
  let source = declaration.source.value
  if (specifier.type === 'ImportSpecifier') {
    let { imported } = specifier
    return {
      name: imported.type === 'Identifier' ? imported.name : imported.value,
      source,
    }
  }
  return {
    name: specifier.type === 'ImportNamespaceSpecifier' ? '*' : 'default',
    source,
  }
}
