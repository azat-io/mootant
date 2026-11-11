import path from 'node:path'

import type { FileInputTracking } from './types/file-input-tracking'

import { trackFileReads } from './track-file-reads'

/**
 * `path.dirname` as this module loads, since code it watches may replace it.
 */
let getDirectory = path.dirname

/**
 * Starts recording the files and directories code reads through `node:fs`, and
 * which of them it changed itself: the path it wrote or the directory that path
 * is in. A read counts unless the code wrote that path earlier, since then it
 * reads its own output and not an input.
 *
 * @param accept - Tells whether a path counts when it is read.
 * @returns The files read so far and the function that stops recording and
 *   returns what was read.
 */
export function trackFileInputs(
  accept: (file: string) => boolean,
): FileInputTracking {
  let written = new Set<string>()
  let touched = new Set<string>()
  let files = new Set<string>()
  trackFileReads({
    write: file => {
      written.add(file)
      touched.add(file)
      touched.add(getDirectory(file))
    },
    read: file => {
      if (accept(file) && !written.has(file)) {
        files.add(file)
      }
    },
  })
  return {
    stop: () => {
      trackFileReads(null)
      return {
        modified: [...files].filter(file => touched.has(file)).toSorted(),
        files: [...files].toSorted(),
      }
    },
    files,
  }
}
