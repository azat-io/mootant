import type { NodeTestCommand } from './types/node-test-command'

import { readTestScripts } from '../shared/read-test-scripts'
import { resolveCommand } from './resolve-command'
import { parseCommand } from './parse-command'

/**
 * Finds the command a project runs node:test with: the given command, else the
 * first command of the test scripts of `package.json` (`readTestScripts`) that
 * runs node:test (`resolveCommand`), else plain `node --test`.
 *
 * @param root - Project root, with the `package.json` of the scripts.
 * @param command - Test command the options give, or undefined to read the
 *   scripts.
 * @returns Tool, flags, files and variables of the command.
 * @throws {Error} When the given command does not run node:test.
 */
export async function findTestCommand(
  root: string,
  command: undefined | string,
): Promise<NodeTestCommand> {
  let sources = command === undefined ? await readTestScripts(root) : [command]
  for (let source of sources) {
    for (let words of parseCommand(source)) {
      let resolved = resolveCommand(words)
      if (resolved !== null) {
        return resolved
      }
    }
  }
  if (command !== undefined) {
    throw new Error(
      `The command "${command}" does not run node:test; give one such as "node --test", "tsx --test", "bnt" or "borp".`,
    )
  }
  return { flags: [['--test']], tool: 'node', files: [], env: {} }
}
