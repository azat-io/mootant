/**
 * Flags that load a module before the test file.
 */
const LOADER_FLAGS = new Set([
  '--experimental-loader',
  '--require',
  '--import',
  '--loader',
  '-r',
])

/**
 * Lists the modules Node flags load before the test file: the values of
 * `--import`, `--require`, `-r`, `--loader` and `--experimental-loader`, given
 * as the next word or after `=`, or the values of the given flags only.
 *
 * @param execArgv - Node flags.
 * @param flags - Flags whose values to list; all of the above by default.
 * @returns Specifiers in order.
 */
export function listLoaders(
  execArgv: readonly string[],
  flags: ReadonlySet<string> = LOADER_FLAGS,
): string[] {
  let loaders: string[] = []
  for (let [index, flag] of execArgv.entries()) {
    let [name, ...value] = flag.split('=')
    if (flags.has(name!)) {
      if (value.length > 0) {
        loaders.push(value.join('='))
      } else if (index + 1 < execArgv.length) {
        loaders.push(execArgv[index + 1]!)
      }
    }
  }
  return loaders
}
