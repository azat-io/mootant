import { realpathSync } from 'node:fs'

import type { SwitchedFile } from '../../types/adapter/switched-file'
import type { JestProject } from './types/jest-project'

/**
 * Why no test loads such a file through the transform, as the end of the core's
 * warning.
 */
const IGNORED =
  "the Jest configuration's transformIgnorePatterns keeps it out of the transform"

/**
 * Lists the switched files that every kept project keeps out of the transform,
 * matched as Jest matches them: the `transformIgnorePatterns` of a project
 * joined into one expression with no flags, tested on the real path, which is
 * the path Jest loads. A project with no patterns keeps nothing out.
 *
 * @param projects - Kept projects.
 * @param files - Switched files.
 * @returns The files no project transforms, with the reason, in their order.
 */
export function listUnservedFiles(
  projects: readonly JestProject[],
  files: readonly SwitchedFile[],
): { reason: string; file: string }[] {
  let patterns = projects.map(({ config }) =>
    config.transformIgnorePatterns.length === 0 ?
      null
    : new RegExp(config.transformIgnorePatterns.join('|')),
  )
  return files.flatMap(({ file }) => {
    let real = realpathSync(file)
    return patterns.every(pattern => pattern?.test(real) === true) ?
        [{ reason: IGNORED, file }]
      : []
  })
}
