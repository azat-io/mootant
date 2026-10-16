import { RUNTIME_SYMBOL_KEY } from '../runtime/runtime-symbol-key'

/**
 * Builds the check a switched Vue template evaluates at a mutant site. The Vue
 * compiler reads `globalThis` as a property of the component, so the check
 * reaches the runtime through `Math`, which it leaves alone, as it leaves
 * `Symbol` since version 3.5. The check is written with backticks, which
 * neither quote of an attribute value ends. Outside mootant's workers the
 * runtime is undefined, the check is `undefined`, and the original code runs.
 *
 * @param id - Id of the mutant, made of digits and lowercase letters.
 * @returns Expression text that is true while the mutant is active.
 */
export function getTemplateSiteCheck(id: string): string {
  return `Math[Symbol.for(\`${RUNTIME_SYMBOL_KEY}\`)]?.hit(\`${id}\`)`
}
