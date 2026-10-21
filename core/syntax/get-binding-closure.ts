import type { VariableDeclarator, Node } from 'oxc-parser'

import type { BindingClosure } from '../../types/syntax/binding-closure'
import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { Binding } from '../../types/syntax/binding'

/**
 * Declarations that the `export` declarations of each program declare,
 * collected once per program.
 */
let exportedDeclarations = new WeakMap<Node, ReadonlySet<Node>>()

/**
 * Tells how far the program that declares a binding holds its uses. The scope
 * analysis sees one program: a JavaScript or TypeScript file, or one script
 * block or the template of a component. Each file is its own module: script
 * files that share their top level with other scripts, as in a TypeScript
 * `--outFile` build, are outside the model. A binding is `open` when code may
 * write it where the analysis sees no write of it, or a read that the analysis
 * resolves to it may read another value: every binding of an opaque program (a
 * direct `eval` call, a `with` statement or any TypeScript namespace that is
 * not ambient, since TypeScript resolves bare names across its bodies and may
 * drop it; see `ScopeAnalysis.opaque`); and every name of a shared scope (see
 * `getSharedScopes`) but a `const` that declares the name as a whole, since the
 * template, another script block of the component, a parent that passes a
 * Svelte prop or the template of an Astro file, which mootant does not parse,
 * may assign it, and a destructured `const` may be a prop that the parent
 * changes, as `$props()` and `defineProps()` compile its reads to reads of the
 * current props. It is `write-closed` when the program holds every write but
 * the value leaves it: a `const` of a shared scope that declares the name as a
 * whole, and a name that an `export` declaration declares, which importers read
 * but cannot assign. Every other binding is `closed`, such as a function local
 * of a component. `export { x }` and `export default x` are references, not
 * declarations, so the binding they export stays `closed`, though importers
 * read its value.
 *
 * @param scopes - Scope analysis of the program.
 * @param shared - Scopes of the program whose names code outside them may read
 *   and write: the program and the blocks of the Svelte declaration tags for a
 *   component, none for a JavaScript or TypeScript file.
 * @param binding - Binding declared in the program.
 * @returns Whether the binding is closed, write-closed or open.
 */
export function getBindingClosure(
  scopes: ScopeAnalysis,
  shared: ReadonlySet<Node>,
  binding: Binding,
): BindingClosure {
  if (scopes.opaque) {
    return 'open'
  }
  if (shared.has(binding.scope)) {
    return (
        binding.kind === 'const' &&
          (binding.declaration as VariableDeclarator).id === binding.identifier
      ) ?
        'write-closed'
      : 'open'
  }
  return isExportDeclared(binding) ? 'write-closed' : 'closed'
}

/**
 * Collects what the `export` declarations among statements declare: every
 * declarator of an exported variable declaration, and any other exported
 * declaration as a whole.
 *
 * @param statements - Statements of a program.
 * @returns The exported declarators and declarations.
 */
function collectExportedDeclarations(statements: readonly Node[]): Set<Node> {
  let declarations = new Set<Node>()
  for (let statement of statements) {
    if (
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
    ) {
      let { declaration } = statement
      if (declaration?.type === 'VariableDeclaration') {
        for (let declarator of declaration.declarations) {
          declarations.add(declarator)
        }
      } else if (declaration) {
        declarations.add(declaration)
      }
    }
  }
  return declarations
}

/**
 * Tells whether an `export` declaration declares a binding: a named export of
 * its variable, function, class, enum or namespace declaration, or a default
 * export of its function or class declaration. Only the statements of a program
 * count: those of a namespace body are exports too, but such a body either
 * makes the program opaque or is ambient and runs no code. The statements of
 * each program are read once.
 *
 * @param binding - Binding to check.
 * @returns Whether a statement of the program exports the declaration.
 */
function isExportDeclared(binding: Binding): boolean {
  let { scope } = binding
  if (scope.type !== 'Program') {
    return false
  }
  let exported = exportedDeclarations.get(scope)
  if (!exported) {
    exported = collectExportedDeclarations(scope.body)
    exportedDeclarations.set(scope, exported)
  }
  return exported.has(binding.declaration)
}
