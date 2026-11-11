import path from 'node:path'

import type { InputTracking } from './types/input-tracking'

import { trackEnvironment } from './track-environment'
import { trackFileInputs } from './track-file-inputs'

/**
 * Starts recording what the code of a test process or worker reads: the project
 * files and directories read through `node:fs`, those it changed itself, and
 * the environment variables, apart from those the test runner reads on its
 * own.
 *
 * @param root - Project root; only files in it, outside `node_modules`, count.
 * @param environment - Variables the test runner reads on its own and the
 *   holder of its `metaEnv`, if any, as `trackEnvironment` takes them; passed
 *   to both of its calls.
 * @returns The files read so far, `process.env` as Node made it, and the
 *   function that stops recording and returns what was read.
 */
export function trackInputs(
  root: string,
  environment: Parameters<typeof trackEnvironment>[0],
): InputTracking {
  let variables = new Set<string>()
  let tracking = trackFileInputs(
    file =>
      (file === root || file.startsWith(root + path.sep)) &&
      !file.includes(`${path.sep}node_modules${path.sep}`),
  )
  let real = trackEnvironment(environment, name => {
    variables.add(name)
  })
  return {
    stop: () => {
      let { modified, files } = tracking.stop()
      trackEnvironment(environment, null)
      return {
        environment: [...variables].toSorted(),
        modified,
        files,
      }
    },
    files: tracking.files,
    real,
  }
}
