import { spawn } from 'node:child_process'

import type { JestConfig } from './types/jest-config'

import { waitForJestExit } from './wait-for-jest-exit'
import { insertJestFlags } from './insert-jest-flags'

/**
 * Start of the JSON `--showConfig` prints; only its top level is indented this
 * little, and a configuration that logs writes to the same stream before it.
 */
const CONFIG_START = '{\n  "configs"'

/**
 * Reads Jest's resolved configuration with `--showConfig`, in a process group
 * of its own. What is printed before the JSON, which comes last, goes to
 * `onOutput`. A configuration that hangs is not bounded, since plain Jest would
 * hang too, but a process that outlives Jest holds nothing back.
 *
 * @param input - How to run Jest.
 * @param input.onOutput - Receives the text printed before the JSON.
 * @param input.nodeFlags - Node flags of the command.
 * @param input.env - Environment of the process.
 * @param input.args - Jest's arguments that stayed after the filter.
 * @param input.base - Flags mootant adds to them.
 * @param input.root - Project root, the working directory.
 * @param input.bin - Path of the file Jest's binary runs.
 * @returns The configuration.
 * @throws {Error} When the process fails, with Jest's own output.
 */
export function readJestConfig(input: {
  onOutput(text: string): void
  args: readonly string[]
  base: readonly string[]
  env: NodeJS.ProcessEnv
  nodeFlags: string[]
  root: string
  bin: string
}): Promise<JestConfig> {
  return new Promise((resolve, reject) => {
    let child = spawn(
      process.execPath,
      [
        ...input.nodeFlags,
        input.bin,
        ...insertJestFlags(input.args, ['--showConfig', ...input.base]),
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: input.root,
        env: input.env,
        detached: true,
      },
    )
    let stdout = ''
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (text: string) => {
      stdout += text
      output += text
    })
    child.stderr.on('data', (text: string) => {
      output += text
    })
    child.on('error', error => {
      reject(
        new Error(
          `Jest could not start in ${input.root}: ${error.message}; check that the directory exists.`,
        ),
      )
    })
    void waitForJestExit(child).then(({ code, how }) => {
      if (code !== 0) {
        reject(
          new Error(
            `Jest ${how} before it printed its configuration:\n${output}`,
          ),
        )
        return
      }
      let start = stdout.lastIndexOf(CONFIG_START)
      let config = start === -1 ? null : parseConfig(stdout.slice(start))
      if (config === null) {
        reject(
          new Error(
            `Jest printed no configuration mootant can read:\n${output}`,
          ),
        )
        return
      }
      if (start > 0) {
        input.onOutput(stdout.slice(0, start))
      }
      resolve(config)
    })
  })
}

/**
 * Parses what `--showConfig` printed.
 *
 * @param text - Text from the start of the JSON on.
 * @returns The configuration, or null when the text is not JSON.
 */
function parseConfig(text: string): JestConfig | null {
  try {
    return JSON.parse(text) as JestConfig
  } catch {
    return null
  }
}
