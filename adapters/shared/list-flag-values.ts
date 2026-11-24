import { readFlagName } from './read-flag-name'

/**
 * Lists the values Node flags give to the given flags, as the next word or
 * after `=`, in order; such a flag that is the last word and has no `=` gives
 * none. Names are read as Node's option parser reads them (`readFlagName`), so
 * `--experimental_loader` gives its value to `--experimental-loader`.
 *
 * @param execArgv - Node flags.
 * @param flags - Flags whose values to list.
 * @returns Values in order.
 */
export function listFlagValues(
  execArgv: readonly string[],
  flags: ReadonlySet<string>,
): string[] {
  let values: string[] = []
  for (let [index, flag] of execArgv.entries()) {
    let [name, ...value] = flag.split('=')
    if (flags.has(readFlagName(name!))) {
      if (value.length > 0) {
        values.push(value.join('='))
      } else if (index + 1 < execArgv.length) {
        values.push(execArgv[index + 1]!)
      }
    }
  }
  return values
}
