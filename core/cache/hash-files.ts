import { readFile, readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'

import { compareCodeUnits } from '../compare-code-units'
import { UNKNOWN_HASH } from './unknown-hash'
import { runInChunks } from './run-in-chunks'

/**
 * Most files read at once, so a large project does not run out of file
 * descriptors.
 */
const CHUNK_SIZE = 32

/**
 * Size in bytes above which a file is read as a stream rather than whole, so a
 * large file never sits in memory at once, and one over the 2 GiB that a whole
 * read takes gets a hash too.
 */
const STREAM_SIZE = 16 * 1024 * 1024

/**
 * Hashes the contents of files, each file once, a few at a time, a large one as
 * a stream (`STREAM_SIZE`); a directory is hashed by the names in it, those of
 * directories marked, so adding, removing or replacing a file with a directory
 * changes it, while a change inside a directory in it does not. A path that is
 * neither a file nor a directory, such as a device, a pipe or a socket, is
 * never read, as reading `/dev/stdin` or a pipe would wait for its writer and
 * `/dev/zero` never ends: its content is unknown, which differs from a missing
 * file.
 *
 * @param paths - Absolute paths, duplicates allowed.
 * @returns SHA-256 of each file in hex by path, `UNKNOWN_HASH` for a path that
 *   is neither a file nor a directory, or null for a file that cannot be read,
 *   such as a missing one.
 */
export async function hashFiles(
  paths: Iterable<string>,
): Promise<Map<string, string | null>> {
  let hashes = new Map<string, string | null>()
  await runInChunks([...new Set(paths)], CHUNK_SIZE, async file => {
    hashes.set(file, await hashPath(file))
  })
  return hashes
}

/**
 * Hashes what a path stands for: the content of a file, or the sorted names in
 * a directory, each name of a directory followed by `/`, after a marker that
 * sets them apart from a file.
 *
 * @param file - Absolute path.
 * @returns SHA-256 in hex, `UNKNOWN_HASH` for a path that is neither a file nor
 *   a directory, or null when the path cannot be read.
 */
async function hashPath(file: string): Promise<string | null> {
  try {
    let kind = await stat(file)
    if (kind.isFile() && kind.size <= STREAM_SIZE) {
      return createHash('sha256')
        .update(await readFile(file))
        .digest('hex')
    }
    if (kind.isFile()) {
      let hash = createHash('sha256')
      for await (let chunk of createReadStream(file)) {
        hash.update(chunk as Buffer)
      }
      return hash.digest('hex')
    }
    if (!kind.isDirectory()) {
      return UNKNOWN_HASH
    }
    let names = (await readdir(file, { withFileTypes: true }))
      .map(entry => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .toSorted(compareCodeUnits)
    return createHash('sha256')
      .update(`directory\0${names.join('\0')}`)
      .digest('hex')
  } catch {
    return null
  }
}
