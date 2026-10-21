import type { IdentifierReference, Program, Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'

/**
 * Tells whether the name of a type reference surely refers to a type that the
 * file neither declares nor imports, such as the built-in `Promise`: no type
 * alias, interface, class or enum of the file declares it in scope (see
 * `ScopeAnalysis.typeReferences`), no type parameter of the file and no import,
 * a type-only one included, has the name, and the program is neither opaque nor
 * shares a scope (see `isGlobalName`), since a namespace or another script
 * block may declare the type where the scope analysis does not look.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Name of a type reference.
 * @returns Whether the name refers to a type from outside the file.
 */
export function isGlobalTypeName(
  program: AnalyzedProgram,
  node: IdentifierReference,
): boolean {
  let { shared, scopes, tree } = program
  /**
   * The runtime tree lists its nodes in pre-order, so the Program comes first.
   */
  let root = tree.order[0] as Program
  return (
    !scopes.opaque &&
    shared.size === 0 &&
    !scopes.typeReferences.has(node) &&
    !scopes.typeParameters.has(node.name) &&
    root.body.every(statement => !importsName(statement, node.name))
  )
}

/**
 * Tells whether a statement of the Program is an import that declares a name:
 * an import declaration of any kind, or an import assignment, also exported.
 *
 * @param statement - Statement of the Program.
 * @param name - Name to look for.
 * @returns Whether the statement imports the name.
 */
function importsName(statement: Node, name: string): boolean {
  let declaration =
    statement.type === 'ExportNamedDeclaration' ?
      statement.declaration
    : statement
  switch (declaration?.type) {
    case 'TSImportEqualsDeclaration':
      return declaration.id.name === name
    case 'ImportDeclaration':
      return declaration.specifiers.some(
        specifier => specifier.local.name === name,
      )
    default:
      return false
  }
}
