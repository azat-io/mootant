import { RUNTIME_GLOBAL } from '../../core/runtime/runtime-global'
import { runProgram } from './run-program'

/**
 * Switched program and the mutant to switch on.
 */
interface SwitchedProgram {
  /**
   * Id of the active mutant, null for the original code, or undefined to run
   * without a mutant runtime, as outside mootant.
   */
  active: undefined | string | null

  /**
   * Switched text of the program; it declares a function `f`.
   */
  switched: string

  /**
   * File name, whose extension selects the language.
   */
  file: string
}

/**
 * Runs a switched program like `runProgram`, with a mutant runtime whose `hit`
 * and `hitAny` tell only the active mutant's site to switch, and whose `gap`,
 * `none` and `cut` work as the real ones do, with index loops and an iterator
 * of their own. The runtime is set, or removed, by a line in front of the
 * program, so every run sets its own.
 *
 * @param program - Switched text, file name and active mutant.
 * @param inputs - Arguments of `f`, one list per input.
 * @returns Canonical text of the output on each input.
 */
export function runSwitchedProgram(
  program: SwitchedProgram,
  inputs: unknown[][],
): Promise<string[]> {
  let { switched, active, file } = program
  let runtime = [
    `let runtime = { active: ${JSON.stringify(active)}, gap: Symbol('gap') };`,
    'runtime.hit = id => id === runtime.active;',
    'runtime.hitAny = ids => { for (let i = 0; i < ids.length; i++) { if (runtime.hit(ids[i])) { return true } } return false };',
    'runtime.none = { [Symbol.iterator]: () => ({ next: () => ({ value: undefined, done: true }) }) };',
    'runtime.cut = array => { let kept = 0; for (let i = 0; i < array.length; i++) { if (array[i] !== runtime.gap) { array[kept] = array[i]; kept += 1 } } array.length = kept; return array };',
    `globalThis.${RUNTIME_GLOBAL} = runtime;`,
  ]
  let setup =
    active === undefined ?
      `delete globalThis.${RUNTIME_GLOBAL};`
    : `{ ${runtime.join(' ')} }`
  return runProgram(`${setup}\n${switched}`, file, inputs)
}
