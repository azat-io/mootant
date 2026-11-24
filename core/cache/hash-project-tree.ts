import type { Dirent } from 'node:fs'

import { readlink, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

import type { ProjectTree } from '../../types/cache/project-tree'

import { compareCodeUnits } from '../compare-code-units'
import { getPortablePath } from './get-portable-path'
import { runInChunks } from './run-in-chunks'
import { hashFiles } from './hash-files'

/**
 * Directories the hash of a project tree leaves out, at any depth: installed
 * packages and the store pnpm keeps at the root of a project mounted as a file
 * system of its own, whose changes the lockfile stands for, git's own files,
 * and the reports mootant writes.
 */
const SKIPPED = new Set(['node_modules', '.pnpm-store', '.mootant', '.git'])

/**
 * Most directories listed or links read at once, so a large project does not
 * run out of file descriptors.
 */
const CHUNK_SIZE = 32

/**
 * Hashes everything under the project root with its contents, so that adding,
 * removing, renaming or changing any file, directory or symbolic link changes
 * the hash: a new test file, a test file the dry run did not run that now
 * imports a mutated file, or a file that now shadows a module a test imports.
 * Directories in `SKIPPED` and the given outputs of mootant are left out. A
 * symbolic link counts by its target, never followed, and a path that is
 * neither a file nor a directory by its name, as `hashFiles` cannot read it. A
 * directory that cannot be listed may still hold files a test loads by their
 * paths, so the tree then has no hash. The entries go into the hash one at a
 * time, so a large tree never makes one long text, and come back by path, so a
 * later tree can name what changed.
 *
 * @param root - Directory whose contents are hashed: the project root.
 * @param outputs - Absolute paths mootant writes into the project during or
 *   after a run, such as the HTML report and the work directory, which are left
 *   out.
 * @returns The hash with the entry of every path, or null when a directory
 *   cannot be listed or a link cannot be read.
 */
export async function hashProjectTree(
  root: string,
  outputs: readonly string[],
): Promise<ProjectTree | null> {
  let skipped = new Set(outputs)
  let entries: [string, string, string | null][] = []
  let unread = 0
  let files: string[] = []
  let links: string[] = []
  /**
   * Lists directories a chunk at a time, then the directories found in them.
   *
   * @param directories - Absolute paths of the directories.
   * @returns Resolves when every directory under them is listed.
   */
  async function walk(directories: string[]): Promise<void> {
    let found: string[] = []
    await runInChunks(directories, CHUNK_SIZE, async directory => {
      let listed = await readEntries(directory)
      if (listed === null) {
        unread += 1
        return
      }
      entries.push([getPortablePath(directory, root), 'directory', null])
      for (let entry of listed) {
        let file = path.join(directory, entry.name)
        if (skipped.has(file)) {
          continue
        }
        if (entry.isSymbolicLink()) {
          links.push(file)
        } else if (entry.isDirectory()) {
          if (!SKIPPED.has(entry.name)) {
            found.push(file)
          }
        } else {
          files.push(file)
        }
      }
    })
    if (found.length > 0) {
      await walk(found)
    }
  }
  await walk([root])
  await runInChunks(links, CHUNK_SIZE, async link => {
    let target = await readTarget(link)
    if (target === null) {
      unread += 1
    }
    entries.push([getPortablePath(link, root), 'link', target])
  })
  if (unread > 0) {
    return null
  }
  let hashes = await hashFiles(files)
  for (let file of files) {
    entries.push([getPortablePath(file, root), 'file', hashes.get(file)!])
  }
  let sorted = entries.toSorted(([left], [right]) =>
    compareCodeUnits(left, right),
  )
  let hash = createHash('sha256')
  for (let entry of sorted) {
    hash.update(`${JSON.stringify(entry)}\n`)
  }
  return {
    entries: new Map(
      sorted.map(([portable, kind, value]) => [
        portable,
        JSON.stringify([kind, value]),
      ]),
    ),
    hash: hash.digest('hex'),
  }
}

/**
 * Lists the entries of a directory.
 *
 * @param directory - Absolute path.
 * @returns Its entries, or null when it cannot be listed.
 */
async function readEntries(directory: string): Promise<Dirent[] | null> {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }
}

/**
 * Reads the target of a symbolic link.
 *
 * @param link - Absolute path of the link.
 * @returns Its target as written, or null when it cannot be read.
 */
async function readTarget(link: string): Promise<string | null> {
  try {
    return await readlink(link)
  } catch {
    return null
  }
}
