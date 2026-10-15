import { RUNTIME_GLOBAL } from '../runtime/runtime-global'

/**
 * Builds the check a switched file evaluates at a mutant site. It needs no
 * import or declaration: outside mootant's workers the runtime global is
 * undefined, the check is `undefined`, and the original code runs.
 *
 * @param id - Id of the mutant.
 * @returns Expression text that is true while the mutant is active.
 */
export function getSiteCheck(id: string): string {
  return `globalThis.${RUNTIME_GLOBAL}?.hit(${JSON.stringify(id)})`
}
