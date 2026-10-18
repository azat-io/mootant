import { execFile } from 'node:child_process'

/**
 * Script that prints the version of Node and whether it strips TypeScript types
 * without flags.
 */
const PROBE =
  'JSON.stringify([process.version, typeof process.features.typescript === "string"])'

/**
 * Asks a Node binary for its version and whether it strips TypeScript types by
 * default (`process.features.typescript`, Node 22.18 and later).
 *
 * @param node - Path or name of the Node binary.
 * @returns Version, such as `v22.12.0`, and whether types are stripped.
 * @throws {Error} When the binary cannot run.
 */
export function readNodeRuntime(
  node: string,
): Promise<{ typescript: boolean; version: string }> {
  return new Promise((resolve, reject) => {
    execFile(node, ['-p', PROBE], (error, stdout) => {
      if (error === null) {
        let [version, typescript] = JSON.parse(stdout) as [string, boolean]
        resolve({ typescript, version })
      } else {
        reject(
          new Error(`mootant cannot run Node at ${node}: ${error.message}`),
        )
      }
    })
  })
}
