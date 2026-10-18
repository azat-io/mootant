/**
 * Reads the `--test-timeout` of Node flags, the timeout node:test gives every
 * test and suite that sets none.
 *
 * @param execArgv - Node flags, a value given as the next word or after `=`.
 * @returns Milliseconds of the last such flag, or 0 without a valid one.
 */
export function readTestTimeout(execArgv: readonly string[]): number {
  let timeout = 0
  for (let [index, flag] of execArgv.entries()) {
    let [name, ...value] = flag.split('=')
    if (name === '--test-timeout') {
      let parsed = Number(
        value.length > 0 ? value.join('=') : execArgv[index + 1],
      )
      timeout = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }
  }
  return timeout
}
