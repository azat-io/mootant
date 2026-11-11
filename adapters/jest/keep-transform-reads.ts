import {
  writeFileSync,
  readFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs'
import path from 'node:path'

import { compareCodeUnits } from '../../core/compare-code-units'

/**
 * Name of the file in mootant's cache directory of Jest that keeps the reads.
 */
const FILE_NAME = 'transform-reads.json'

/**
 * Joins what the transformers, the test environments, the test runners and the
 * projects' own resolvers read in the dry runs of this session with what they
 * read in earlier sessions of the project, and keeps the join for later ones in
 * mootant's cache directory of Jest, by paths relative to the root. A cache
 * spares a transformer some reads in a later session, such as ts-jest's map of
 * the imports of a module, or Jest's disk cache, which spares `process`, so the
 * reads of one session alone would change the key of an unchanged project from
 * one run to the next. The file goes when Jest's cache goes, and the spared
 * reads come back with it. A path whose directory is gone leaves the join, as
 * Babel's probes in a directory a test made for one run would pile up and,
 * named as configuration files, change the key on every run. A path of an
 * earlier session that this one did not read and that changed since it started
 * stays in the file but is not returned: it shaped no verdict of this session,
 * and a path the run itself changes, such as a directory a test writes a file
 * to, would keep every verdict out of the cache on every run. A file that
 * cannot be read starts an empty join, and one that cannot be written stays as
 * it was, as the join only spares runs.
 *
 * @param input - What to join.
 * @param input.directory - Absolute path of mootant's cache directory of Jest.
 * @param input.reads - What the dry runs of this session read, by absolute
 *   path.
 * @param input.started - Start of the session in milliseconds since the epoch.
 * @param input.root - Real path of the project root.
 * @returns The join, by absolute path, without the paths of earlier sessions
 *   that changed since this one started.
 */
export function keepTransformReads(input: {
  reads: ReadonlySet<string>
  directory: string
  started: number
  root: string
}): Set<string> {
  let { directory, started, reads, root } = input
  let file = path.join(directory, FILE_NAME)
  let joined = new Set(reads)
  for (let kept of readKept(file)) {
    joined.add(path.resolve(root, kept))
  }
  let present = [...joined].filter(entry => existsSync(path.dirname(entry)))
  let relative = present
    .map(entry => path.relative(root, entry))
    .toSorted(compareCodeUnits)
  try {
    mkdirSync(directory, { recursive: true })
    let temporary = `${file}.${process.pid}`
    writeFileSync(temporary, `${JSON.stringify(relative, null, 2)}\n`)
    renameSync(temporary, file)
  } catch {}
  return new Set(
    present.filter(
      entry => reads.has(entry) || !isChangedSince(entry, started),
    ),
  )
}

/**
 * Reads the paths a file of earlier sessions keeps.
 *
 * @param file - Absolute path of the file.
 * @returns Paths relative to the root, none when the file is missing or holds
 *   something else.
 */
function readKept(file: string): string[] {
  try {
    let value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(value) ?
        value.filter(entry => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * Tells whether a path was modified at or after a moment.
 *
 * @param entry - Absolute path.
 * @param since - Moment in milliseconds since the epoch.
 * @returns Whether it was; false for a missing path.
 */
function isChangedSince(entry: string, since: number): boolean {
  try {
    return statSync(entry).mtimeMs >= since
  } catch {
    return false
  }
}
