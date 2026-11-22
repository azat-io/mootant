import { realpathSync } from 'node:fs'
import path from 'node:path'

import type { FileInputTracking } from './types/file-input-tracking'

import { trackFileReads } from './track-file-reads'

/**
 * `path.dirname` as this module loads, since code it watches may replace it.
 */
let getDirectory = path.dirname

/**
 * `path.basename` as this module loads.
 */
let getName = path.basename

/**
 * `path.join` as this module loads.
 */
let joinPaths = path.join

/**
 * `fs.realpathSync` as this module loads, which reports nothing.
 */
let getRealPath = realpathSync

/**
 * Starts recording the files and directories code reads through `node:fs`, and
 * which of them it changed itself: the path it wrote or the directory that path
 * is in. A read counts unless the code wrote that path earlier, since then it
 * reads its own output and not an input, as with a directory `mkdtemp` made or
 * a copy `cp` wrote; anything else in a directory the code made counts, as it
 * may come from what no read names, such as a child process or a link. A path
 * written is taken as given and by the real path of its directory, so a read or
 * a module that names it by that path, as `require` does, is the same.
 *
 * @param accept - Tells whether a path counts when it is read.
 * @returns The files read so far, whether a path is one the code wrote, and the
 *   function that stops recording and returns what was read.
 */
export function trackFileInputs(
  accept: (file: string) => boolean,
): FileInputTracking {
  let written = new Set<string>()
  let touched = new Set<string>()
  let files = new Set<string>()
  trackFileReads({
    write: file => {
      for (let form of [file, getCanonicalPath(file)]) {
        written.add(form)
        touched.add(form)
        touched.add(getDirectory(form))
      }
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
    owns: file => written.has(file),
    files,
  }
}

/**
 * Finds the path a file has through the real path of its directory, which a
 * write may name before the file exists.
 *
 * @param file - Absolute path.
 * @returns The path, or the given one when its directory is missing.
 */
function getCanonicalPath(file: string): string {
  try {
    return joinPaths(getRealPath(getDirectory(file)), getName(file))
  } catch {
    return file
  }
}
