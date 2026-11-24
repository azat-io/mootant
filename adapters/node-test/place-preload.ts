import { pathToFileURL } from 'node:url'

import { readNodeOptions } from '../shared/read-node-options'
import { readFlagName } from '../shared/read-flag-name'

/**
 * Flags that require a module.
 */
const REQUIRE_FLAGS = new Set(['--require', '-r'])

/**
 * Flags that load a module through the ES module loader.
 */
const LOADING_FLAGS = new Set(['--experimental-loader', '--import', '--loader'])

/**
 * Puts mootant's preload where it runs before every module the project loads
 * first. Node runs every `--require` before any `--import`, and the flags of
 * `NODE_OPTIONS` before those of the command line, so: when the project
 * requires modules, the preload is the first `--require` (of `NODE_OPTIONS` if
 * they require one); otherwise it is the first `--import`, of `NODE_OPTIONS`
 * when they load modules, else of the command line. `NODE_OPTIONS` are read as
 * Node reads them (`readNodeOptions`, `readFlagName`), quotes included.
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
  let options = readNodeOptions(nodeOptions).map(readFlagName)
  if (options.some(name => REQUIRE_FLAGS.has(name))) {
    return {
      nodeOptions: `--require=${JSON.stringify(preload)} ${nodeOptions}`,
      args: [...execArgv],
    }
  }
  if (required) {
    return { args: ['--require', preload, ...execArgv], nodeOptions }
  }
  if (options.some(name => LOADING_FLAGS.has(name))) {
    return {
      nodeOptions: `--import=${url} ${nodeOptions}`,
      args: [...execArgv],
    }
  }
  return { args: ['--import', url, ...execArgv], nodeOptions }
}
