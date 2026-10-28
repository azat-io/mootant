import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

import { compareCodeUnits } from '../compare-code-units'
import { runInChunks } from './run-in-chunks'

/**
 * Most files read at once, so a large project does not run out of file
 * descriptors.
 */
const CHUNK_SIZE = 32

/**
 * Hashes the contents of files, each file once, a few at a time; a directory is
 * hashed by the names in it, those of directories marked, so adding, removing
 * or replacing a file with a directory changes it, while a change inside a
 * directory in it does not.
 *
 * @param paths - Absolute paths, duplicates allowed.
 * @returns SHA-256 of each file in hex by path, or null for a file that cannot
 *   be read, such as a missing one.
 */
export async function hashFiles(
  paths: Iterable<string>,
): Promise<Map<string, string | null>> {
  let hashes = new Map<string, string | null>()
  await runInChunks([...new Set(paths)], CHUNK_SIZE, async file => {
    let content = await readContent(file)
    hashes.set(
      file,
      content === null ? null : (
        createHash('sha256').update(content).digest('hex')
      ),
    )
  })
  return hashes
}

/**
 * Reads what the hash of a path stands for: the content of a file, or the
 * sorted names in a directory, each name of a directory followed by `/`, after
 * a marker that sets them apart from a file.
 *
 * @param file - Absolute path.
 * @returns The content, or null when the path cannot be read.
 */
async function readContent(file: string): Promise<Buffer | string | null> {
  try {
    return await readFile(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EISDIR') {
      return null
    }
  }
  try {
    let names = (await readdir(file, { withFileTypes: true }))
      .map(entry => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .toSorted(compareCodeUnits)
    return `directory\0${names.join('\0')}`
  } catch {
    return null
  }
}
