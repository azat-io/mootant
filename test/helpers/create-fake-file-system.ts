import type { PathLike, Dirent, Stats } from 'node:fs'

import { dirname, resolve, join } from 'node:path'

/**
 * In-memory replacement for the `node:fs/promises` functions that listing
 * mutants calls. Paths are matched without regard to letter case, like the
 * default file systems of macOS and Windows, and `realpath` returns the stored
 * spelling.
 */
export interface FakeFileSystem {
  /**
   * Entries of a directory, following symbolic links to it. With
   * `withFileTypes` the entries are `Dirent`-like objects that do not follow
   * links; otherwise they are names. Both are sorted by name.
   */
  readdir(
    path: PathLike,
    options?: { withFileTypes?: boolean },
  ): Promise<Dirent[] | string[]>

  /**
   * Contents of a file, following symbolic links. Like `node:fs`, the text is
   * returned only when an encoding is requested; otherwise the bytes are.
   */
  readFile(
    path: PathLike,
    options?: ReadFileOptions,
  ): Promise<Buffer<ArrayBuffer> | string>

  /**
   * Absolute path with every symbolic link resolved and the stored letter case
   * of every segment.
   */
  realpath(path: PathLike): Promise<string>

  /**
   * Entry kind, following symbolic links.
   */
  stat(path: PathLike): Promise<Stats>
}

/**
 * Entry of the fake file system that is not a readable file.
 */
export type FakeEntry =
  | {
      /**
       * Directory, a directory that cannot be listed or entered, a file that
       * cannot be read, or a socket, which is neither a file nor a directory.
       */
      kind: 'unreadable-directory' | 'unreadable-file' | 'directory' | 'socket'
    }
  | {
      /**
       * Symbolic link.
       */
      kind: 'symlink'

      /**
       * Absolute path the link points to.
       */
      target: string
    }

/**
 * Encoding argument of `readFile`: a name, an options object, or nothing.
 */
type ReadFileOptions =
  | {
      /**
       * Text encoding; bytes are returned when it is missing.
       */
      encoding?: BufferEncoding | null
    }
  | BufferEncoding
  | null

/**
 * Entry kinds stored by the fake file system.
 */
type StoredEntry =
  | {
      content: string
      kind: 'file'
    }
  | FakeEntry

/**
 * Builds an in-memory file system from absolute paths.
 *
 * A string value is the text of a file. Every ancestor of an entry is a
 * directory, so a tree is described by its files alone. Failures reject with
 * Node-style errors: `ENOENT`, `ENOTDIR`, `EISDIR`, `EACCES` (for unreadable
 * entries and for paths through an unreadable directory) and `ELOOP`.
 *
 * @param entries - Absolute paths mapped to file text or special entries.
 * @returns Fake file system whose functions can be installed into mocks.
 */
export function createFakeFileSystem(
  entries: Record<string, FakeEntry | string>,
): FakeFileSystem {
  let stored = new Map<string, StoredEntry>([
    [resolve('/'), { kind: 'directory' }],
  ])

  for (let [path, entry] of Object.entries(entries)) {
    let absolute = resolve(path)
    let ancestors = getAncestors(absolute)
    for (let directory of ancestors) {
      if (!stored.has(directory)) {
        stored.set(directory, { kind: 'directory' })
      }
    }
    stored.set(
      absolute,
      typeof entry === 'string' ? { content: entry, kind: 'file' } : entry,
    )
  }

  function findStoredPath(path: string): undefined | string {
    if (stored.has(path)) {
      return path
    }
    let lowercased = path.toLowerCase()
    for (let key of stored.keys()) {
      if (key.toLowerCase() === lowercased) {
        return key
      }
    }
    return undefined
  }

  function resolveRealPath(path: PathLike, syscall: string): string {
    let absolute = resolve(String(path))
    let root = resolve('/')
    let pending = splitPath(absolute)
    let current = root
    let hops = 0
    while (pending.length > 0) {
      let parent = stored.get(current)!
      if (parent.kind === 'unreadable-directory') {
        throw createError('EACCES', syscall, path)
      }
      if (parent.kind !== 'directory') {
        throw createError('ENOTDIR', syscall, path)
      }
      let child = findStoredPath(join(current, pending.shift()!))
      if (child === undefined) {
        throw createError('ENOENT', syscall, path)
      }
      let entry = stored.get(child)!
      if (entry.kind === 'symlink') {
        hops += 1
        if (hops > stored.size) {
          throw createError('ELOOP', syscall, path)
        }
        pending = [...splitPath(resolve(entry.target)), ...pending]
        current = root
      } else {
        current = child
      }
    }
    return current
  }

  function follow(path: PathLike, syscall: string): StoredEntry {
    return stored.get(resolveRealPath(path, syscall))!
  }

  function listDirectory(
    path: PathLike,
    withFileTypes: boolean,
  ): Dirent[] | string[] {
    let directory = resolveRealPath(path, 'readdir')
    let entry = stored.get(directory)!
    if (entry.kind === 'unreadable-directory') {
      throw createError('EACCES', 'readdir', path)
    }
    if (entry.kind !== 'directory') {
      throw createError('ENOTDIR', 'readdir', path)
    }
    let children: string[] = []
    for (let child of stored.keys()) {
      if (child !== directory && dirname(child) === directory) {
        children.push(child)
      }
    }
    children.sort()
    if (!withFileTypes) {
      return children.map(child => child.slice(directory.length + 1))
    }
    return children.map(child =>
      createDirent(directory, child, stored.get(child)!.kind),
    )
  }

  function readText(path: PathLike): string {
    let entry = follow(path, 'open')
    if (entry.kind === 'unreadable-file') {
      throw createError('EACCES', 'open', path)
    }
    if (entry.kind !== 'file') {
      throw createError('EISDIR', 'read', path)
    }
    return entry.content
  }

  return {
    readFile: (path, options) =>
      settle(() => {
        let text = readText(path)
        let encoding = typeof options === 'string' ? options : options?.encoding
        return encoding ? text : Buffer.from(text)
      }),
    readdir: (path, options) =>
      settle(() => listDirectory(path, options?.withFileTypes === true)),
    stat: path => settle(() => describeEntry(follow(path, 'stat').kind)),
    realpath: path => settle(() => resolveRealPath(path, 'realpath')),
  }
}

/**
 * Builds a directory entry that answers the kind questions without following
 * symbolic links.
 *
 * @param directory - Absolute path of the listed directory.
 * @param path - Absolute path of the entry.
 * @param kind - Kind of the stored entry.
 * @returns Dirent-like object.
 */
function createDirent(
  directory: string,
  path: string,
  kind: StoredEntry['kind'],
): Dirent {
  return {
    ...describeEntry(kind),
    isSymbolicLink: () => kind === 'symlink',
    name: path.slice(directory.length + 1),
    parentPath: directory,
  }
}

/**
 * Builds a stats object that answers only the kind questions the production
 * code asks.
 *
 * @param kind - Kind of the stored entry.
 * @returns Stats-like object.
 */
function describeEntry(kind: StoredEntry['kind']): Stats {
  return {
    isDirectory: () => kind === 'directory' || kind === 'unreadable-directory',
    isFile: () => kind === 'file' || kind === 'unreadable-file',
    isSymbolicLink: () => false,
  } as Stats
}

/**
 * Lists every directory above a path, up to the file system root.
 *
 * @param path - Absolute path.
 * @returns Ancestor directories, nearest first.
 */
function getAncestors(path: string): string[] {
  let ancestors: string[] = []
  for (
    let parent = dirname(path);
    !ancestors.includes(parent);
    parent = dirname(parent)
  ) {
    ancestors.push(parent)
  }
  return ancestors
}

/**
 * Builds an error shaped like the ones `node:fs` rejects with.
 *
 * @param code - Error code such as `ENOENT`.
 * @param syscall - Name of the failed system call.
 * @param path - Path the call was made with.
 * @returns Error with `code`, `syscall` and `path` set.
 */
function createError(
  code: string,
  syscall: string,
  path: PathLike,
): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: ${syscall} '${String(path)}'`), {
    path: String(path),
    syscall,
    code,
  })
}

/**
 * Runs a synchronous operation as a promise that rejects when it throws, the
 * way the asynchronous `node:fs/promises` functions report failures.
 *
 * @param operation - Operation to run.
 * @returns Promise settled with the operation's outcome.
 */
async function settle<T>(operation: () => T): Promise<T> {
  /**
   * Yield once, so callers observe the result asynchronously like real I/O.
   */
  await Promise.resolve()
  return operation()
}

/**
 * Splits an absolute path into its segments below the root.
 *
 * @param path - Absolute, normalized path.
 * @returns Segment names, outermost first.
 */
function splitPath(path: string): string[] {
  return path
    .slice(resolve('/').length)
    .split(/[/\\]/u)
    .filter(segment => segment !== '')
}
