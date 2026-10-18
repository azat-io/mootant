import { pathToFileURL } from 'node:url'

/**
 * Flag that requires a module in `NODE_OPTIONS`.
 */
const REQUIRE_OPTION = /(?:^|\s)(?:--require|-r)(?:[\s=]|$)/u

/**
 * Flag that loads a module in `NODE_OPTIONS`.
 */
const LOADING_OPTION =
  /(?:^|\s)(?:--experimental-loader|--import|--loader)(?:[\s=]|$)/u

/**
 * Flags that require a module on the command line.
 */
const REQUIRE_FLAGS = new Set(['--require', '-r'])

/**
 * Puts mootant's preload where it runs before every module the project loads
 * first. Node runs every `--require` before any `--import`, and the flags of
 * `NODE_OPTIONS` before those of the command line, so: when the project
 * requires modules, the preload is the first `--require` (of `NODE_OPTIONS` if
 * they require one); otherwise it is the first `--import`, of `NODE_OPTIONS`
 * when they load modules, else of the command line.
 *
 * @param preload - Absolute path of the preload.
 * @param execArgv - Flags of the test processes.
 * @param nodeOptions - `NODE_OPTIONS` of the test processes.
 * @returns Flags and `NODE_OPTIONS` with the preload.
 */
export function placePreload(
  preload: string,
  execArgv: readonly string[],
  nodeOptions: string,
): { nodeOptions: string; args: string[] } {
  let url = pathToFileURL(preload).href
  let required = execArgv.some(flag =>
    REQUIRE_FLAGS.has(flag.split('=', 1)[0]!),
  )
  if (REQUIRE_OPTION.test(nodeOptions)) {
    return {
      nodeOptions: `--require=${JSON.stringify(preload)} ${nodeOptions}`,
      args: [...execArgv],
    }
  }
  if (required) {
    return { args: ['--require', preload, ...execArgv], nodeOptions }
  }
  if (LOADING_OPTION.test(nodeOptions)) {
    return {
      nodeOptions: `--import=${url} ${nodeOptions}`,
      args: [...execArgv],
    }
  }
  return { args: ['--import', url, ...execArgv], nodeOptions }
}
