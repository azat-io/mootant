import type { InputTracking } from './types/input-tracking'

import { createInputFilter } from './create-input-filter'
import { trackEnvironment } from './track-environment'
import { trackFileInputs } from './track-file-inputs'

/**
 * Starts recording what the code of a test process or worker reads: the files
 * and directories read through `node:fs` that count as inputs, inside the
 * project root or outside it (`createInputFilter`), those of them it changed
 * itself, and the environment variables, apart from those the test runner reads
 * on its own.
 *
 * @param places - Project root and work directory of the run, which decide what
 *   counts.
 * @param places.directory - Work directory of the run.
 * @param places.root - Project root.
 * @param environment - Variables the test runner reads on its own and the
 *   holder of its `metaEnv`, if any, as `trackEnvironment` takes them; passed
 *   to both of its calls.
 * @returns The files read so far, `process.env` as Node made it, and the
 *   function that stops recording and returns what was read.
 */
export function trackInputs(
  places: { directory: string; root: string },
  environment: Parameters<typeof trackEnvironment>[0],
): InputTracking {
  let variables = new Set<string>()
  let tracking = trackFileInputs(createInputFilter(places))
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
