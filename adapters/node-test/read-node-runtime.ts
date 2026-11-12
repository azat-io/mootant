import type { ExecFileException } from 'node:child_process'

import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Script that prints the version of Node and whether it strips TypeScript types
 * without flags.
 */
const RUNTIME_PROBE =
  'JSON.stringify([process.version, typeof process.features.typescript === "string"])'

/**
 * Script that prints whether Node compiles CommonJS modules through
 * `Module.prototype._compile` once a synchronous module hook is registered: it
 * patches `_compile`, registers a `load` hook that changes nothing and imports
 * the empty CommonJS file its argument names, by its real path, which is the
 * one `_compile` gets. Without `registerHooks` the test processes register no
 * synchronous hook, so `_compile` sees every CommonJS module and nothing is
 * imported. A failed import ends the script with an error.
 */
const COMPILE_PROBE = `
let api = require('module')
let probe = require('fs').realpathSync(process.argv[1])
if (typeof api.registerHooks !== 'function') {
  console.log(true)
} else {
  let compiles = false
  let compile = api.Module.prototype._compile
  api.Module.prototype._compile = function (content, filename, ...rest) {
    if (filename === probe) {
      compiles = true
    }
    return compile.call(this, content, filename, ...rest)
  }
  api.registerHooks({ load: (url, context, next) => next(url, context) })
  import(require('url').pathToFileURL(probe).href).then(() => {
    console.log(compiles)
  })
}
`

/**
 * Asks a Node binary for its version, whether it strips TypeScript types by
 * default (`process.features.typescript`, Node 22.18 and later), and whether it
 * compiles CommonJS modules through `Module.prototype._compile` once a
 * synchronous module hook is registered, which some versions do not do, such as
 * Node 22.15 to 22.22.2 and 24.0 to 24.11.0. The last question goes to the
 * binary itself, without `NODE_OPTIONS`, whose loaders could make the import of
 * its empty CommonJS file fail or change; that file goes to the work directory.
 * The error of a binary that cannot answer names the question and gives what
 * the binary printed, else how it ended or why it did not start.
 *
 * @param node - Path or name of the Node binary.
 * @param directory - Work directory of the run.
 * @returns Version, such as `v22.12.0`, whether types are stripped, and whether
 *   `_compile` compiles CommonJS modules.
 * @throws {Error} When the binary cannot run or answer.
 */
export async function readNodeRuntime(
  node: string,
  directory: string,
): Promise<{ typescript: boolean; compiles: boolean; version: string }> {
  let [version, typescript] = JSON.parse(
    await runNode(node, {
      failure: `mootant cannot run Node at ${node}`,
      flags: ['-p', RUNTIME_PROBE],
      env: process.env,
    }),
  ) as [string, boolean]
  let probe = path.join(directory, 'probe.cjs')
  writeFileSync(probe, '')
  let environment = { ...process.env }
  delete environment['NODE_OPTIONS']
  let compiles = JSON.parse(
    await runNode(node, {
      failure: `mootant cannot ask Node at ${node} whether it compiles CommonJS modules through Module.prototype._compile`,
      flags: ['-e', COMPILE_PROBE, probe],
      env: environment,
    }),
  ) as boolean
  return { typescript, compiles, version }
}

/**
 * Runs a Node binary and gives what it printed.
 *
 * @param node - Path or name of the Node binary.
 * @param run - Arguments, environment and the start of the error message.
 * @param run.flags - Arguments of the binary.
 * @param run.env - Environment variables of the process.
 * @param run.failure - Start of the error message.
 * @returns Standard output of the process.
 * @throws {Error} When the binary cannot start or exits with an error, with its
 *   standard error, else how it ended or the reason it did not start.
 */
function runNode(
  node: string,
  run: { env: NodeJS.ProcessEnv; failure: string; flags: string[] },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(node, run.flags, { env: run.env }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout)
      } else {
        let printed = stderr.trim()
        reject(
          new Error(
            `${run.failure}: ${printed === '' ? describeFailure(error) : printed}`,
          ),
        )
      }
    })
  })
}

/**
 * Tells how a Node process that printed nothing to its standard error failed.
 *
 * @param error - Error of `execFile`.
 * @returns The signal or exit code that ended the process, or the reason it did
 *   not start.
 */
function describeFailure(error: ExecFileException): string {
  if (typeof error.signal === 'string') {
    return `it was stopped by ${error.signal}`
  }
  return typeof error.code === 'number' ?
      `it exited with code ${error.code}`
    : error.message
}
