import type { BindingIdentifier } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'

/**
 * Names that the declarations of each program bind, collected once per scope
 * analysis.
 */
let declaredNames = new WeakMap<ScopeAnalysis, ReadonlySet<string>>()

/**
 * Tells whether a name surely refers to the global wherever the program reads
 * it or a mutant writes it into the program, as `undefined` in the
 * `[undefined]` of an empty array: no declaration of the program binds the name
 * anywhere; the program is not opaque (see `ScopeAnalysis.opaque`), so it has
 * no direct `eval` call or `with` statement, which may bind the name where the
 * scope analysis does not see it, and no TypeScript namespace that is not
 * ambient, since TypeScript resolves bare names across the bodies of a
 * namespace, such as an exported `undefined` of another body; and it shares no
 * scope (see `getSharedScopes`), since another script block of a component may
 * declare the name. The answer does not depend on where the name is written, so
 * it may reject a place where no declaration of the name is visible.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param name - Name to check.
 * @returns Whether the name refers to the global in any part of the program.
 */
export function isGlobalName(program: AnalyzedProgram, name: string): boolean {
  let { shared, scopes } = program
  if (scopes.opaque || shared.size > 0) {
    return false
  }
  let names = declaredNames.get(scopes)
  if (!names) {
    names = new Set(
      [...scopes.bindings.values()].map(
        binding => (binding.identifier as BindingIdentifier).name,
      ),
    )
    declaredNames.set(scopes, names)
  }
  return !names.has(name)
}
