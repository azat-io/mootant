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
 * tells only the active mutant's site to switch. The runtime is set, or
 * removed, by a line in front of the program, so every run sets its own.
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
  let setup =
    active === undefined ?
      `delete globalThis.${RUNTIME_GLOBAL};`
    : `globalThis.${RUNTIME_GLOBAL} = { hit: id => id === ${JSON.stringify(active)} };`
  return runProgram(`${setup}\n${switched}`, file, inputs)
}
