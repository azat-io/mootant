import type { Dirent } from 'node:fs'

import { AsyncLocalStorage } from 'node:async_hooks'
import { syncBuiltinESMExports } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Functions of `node:fs` that read a path given first, each with its `Sync`
 * variant and the one of `fs/promises` where they exist; `open` reads only with
 * a read-only flag and writes otherwise, and `glob`, of Node 22 and later,
 * reads the directories its patterns walk.
 */
const READERS = new Set([
  'createReadStream',
  'readFile',
  'readdir',
  'opendir',
  'access',
  'exists',
  'lstat',
  'glob',
  'stat',
  'open',
])

/**
 * Functions of `node:fs` that change the paths at the given arguments, with
 * their `Sync` and `fs/promises` variants; `mkdir` changes only the directories
 * it creates.
 */
const WRITERS: Record<string, number[]> = {
  createWriteStream: [0],
  appendFile: [0],
  writeFile: [0],
  rename: [0, 1],
  truncate: [0],
  copyFile: [1],
  symlink: [1],
  unlink: [0],
  rmdir: [0],
  mkdir: [0],
  link: [1],
  cp: [1],
  rm: [0],
}

/**
 * Functions of `node:fs` that read the path at the first argument besides the
 * paths they change: the source of a copy, a move or a hard link, and the
 * target of a symbolic link, relative to the link's directory.
 */
const SOURCES = new Set(['copyFile', 'symlink', 'rename', 'link', 'cp'])

/**
 * Directories a recursive copy of a directory does not walk into for the files
 * it reads.
 */
const SKIPPED = new Set(['node_modules', '.git'])

/**
 * Characters that make a segment of a glob pattern match more than one name.
 */
const GLOB_MAGIC = /[!()*+?@[\\\]{}]/u

/**
 * Bits of numeric `open` flags that create, empty or append to a file.
 */
const WRITE_BITS =
  fs.constants.O_WRONLY |
  fs.constants.O_APPEND |
  fs.constants.O_CREAT |
  fs.constants.O_TRUNC

/**
 * Global slot of the tracking state of the worker process.
 */
const SLOT = Symbol.for('mootant.vitest.file-reads')

/**
 * Receiver of the paths a worker reads and writes.
 */
export interface FileAccessReceiver {
  /**
   * Receives the absolute path of a file or directory written.
   */
  write(file: string): void

  /**
   * Receives the absolute path of a file or directory read, whether it exists
   * or not.
   */
  read(file: string): void
}

/**
 * Tracking state of a worker process.
 */
interface FileSlot {
  /**
   * Functions of `node:fs` as Node made them, which report nothing.
   */
  original: Pick<
    typeof fs,
    'realpathSync' | 'readdirSync' | 'existsSync' | 'statSync'
  >

  /**
   * Whether the asynchronous work of a wrapped `glob` runs, whose own calls of
   * `node:fs` report nothing, as its directories are reported before it
   * starts.
   */
  globbing: AsyncLocalStorage<boolean>

  /**
   * Receiver of the paths, or null while nothing records.
   */
  receiver: FileAccessReceiver | null

  /**
   * Whether a wrapper runs its function, whose own calls of `node:fs`, such as
   * those of `cpSync`, report nothing.
   */
  inside: boolean
}

/**
 * Paths a call of a function of `node:fs` reads and changes.
 */
interface FileAccess {
  /**
   * Absolute paths it changes.
   */
  written: string[]

  /**
   * Absolute paths it reads.
   */
  read: string[]
}

/**
 * Makes `node:fs` report the paths code reads and writes through it: replaces
 * the functions that read a path (`readFile`, `readdir`, `opendir`, `stat`,
 * `lstat`, `access`, `exists`, `open` and `createReadStream`, in their
 * callback, `Sync` and `fs/promises` forms) and those that change one (write,
 * create, remove, move, copy or link it) with wrappers, once per process, and
 * updates the named exports of the ESM modules `node:fs` and `node:fs/promises`
 * to them. A path is reported before the call, so a missing file counts too.
 * `open` reads unless its flags create, empty or append to the file, as `w`,
 * `a` or `O_CREAT` do; `r+` reads. The source of a copy, a move or a link is
 * read, and so is every file and directory in a directory `cp` copies, outside
 * `node_modules` and `.git`; `mkdir` writes only the directories that did not
 * exist. A recursive `readdir` or `opendir` reads the directory and every
 * directory in it, each listed by its own names, so adding a file anywhere in
 * the tree changes what was read; `readdir` also reads the directories behind
 * the links it follows. `glob` reads the same of the directory where each
 * pattern's fixed part ends. Calls of `node:fs` that a wrapped function makes
 * while it runs report nothing, and neither do those of the asynchronous work
 * of `glob`. Descriptors and file handles are not paths and are not reported.
 *
 * @param receiver - Receives the paths while it is the current receiver; the
 *   next call replaces it, and null stops recording.
 */
export function trackFileReads(receiver: FileAccessReceiver | null): void {
  let global = globalThis as { [SLOT]?: FileSlot }
  let slot = global[SLOT]
  if (slot === undefined) {
    slot = {
      original: {
        realpathSync: fs.realpathSync,
        readdirSync: fs.readdirSync,
        existsSync: fs.existsSync,
        statSync: fs.statSync,
      },
      globbing: new AsyncLocalStorage(),
      receiver: null,
      inside: false,
    }
    global[SLOT] = slot
    let names = [...READERS, ...Object.keys(WRITERS)].flatMap(name => [
      name,
      `${name}Sync`,
    ])
    for (let target of [fs, fs.promises]) {
      for (let name of names) {
        let original: unknown = Reflect.get(target, name)
        if (typeof original === 'function') {
          Reflect.set(
            target,
            name,
            wrap(original as (...parameters: unknown[]) => unknown, name, slot),
          )
        }
      }
    }
    syncBuiltinESMExports()
  }
  slot.receiver = receiver
}

/**
 * Finds the paths a call of a function of `node:fs` reads and changes.
 *
 * @param base - Name of the function without `Sync`, such as `readFile`.
 * @param parameters - Arguments of the call.
 * @param slot - Tracking state of the worker, with the functions as Node made
 *   them.
 * @returns Paths read and changed, absolute.
 */
function getAccess(
  base: string,
  parameters: unknown[],
  slot: FileSlot,
): FileAccess {
  let access: FileAccess = { written: [], read: [] }
  if (base === 'glob') {
    let patterns = [parameters[0]].flat()
    let options = parameters[1] as { cwd?: unknown } | undefined
    let cwd = typeof options === 'object' ? toPath(options.cwd) : null
    for (let pattern of patterns) {
      if (typeof pattern === 'string') {
        access.read.push(
          ...walkDirectories(
            getGlobBase(pattern, cwd ?? process.cwd()),
            slot,
            false,
          ),
        )
      }
    }
    return access
  }
  let first = toPath(parameters[0])
  if (READERS.has(base)) {
    if (first !== null) {
      if (base === 'open' && !isReadOpen(parameters[1])) {
        access.written.push(first)
      } else if (
        (base === 'readdir' || base === 'opendir') &&
        Boolean(
          (parameters[1] as { recursive?: unknown } | undefined | null)
            ?.recursive,
        )
      ) {
        access.read.push(...walkDirectories(first, slot, base === 'readdir'))
      } else {
        access.read.push(first)
      }
    }
    return access
  }
  if (first !== null && SOURCES.has(base)) {
    if (base === 'symlink') {
      let link = toPath(parameters[1])
      access.read.push(
        link === null || typeof parameters[0] !== 'string' ?
          first
        : path.resolve(path.dirname(link), parameters[0]),
      )
    } else if (base === 'cp') {
      walk(first, slot, access.read)
    } else {
      access.read.push(first)
    }
  }
  let indexes = WRITERS[base]!
  for (let index of indexes) {
    let file = toPath(parameters[index])
    if (file === null) {
      continue
    }
    if (base === 'mkdir') {
      while (!slot.original.existsSync(file)) {
        access.written.push(file)
        file = path.dirname(file)
      }
    } else {
      access.written.push(file)
    }
  }
  return access
}

/**
 * Wraps a function of `node:fs` so it reports its path argument to the current
 * receiver before it runs.
 *
 * @param original - Function to wrap.
 * @param name - Its name, such as `readFileSync`.
 * @param slot - Tracking state of the worker.
 * @returns Wrapper with the properties of the function, such as its
 *   `util.promisify.custom`.
 */
function wrap(
  original: (...parameters: unknown[]) => unknown,
  name: string,
  slot: FileSlot,
): (...parameters: unknown[]) => unknown {
  let base = name.replace(/Sync$/u, '')
  /**
   * Reports the paths, then calls the function.
   *
   * @param parameters - Arguments of the call.
   * @returns What the function returns.
   */
  function wrapper(this: unknown, ...parameters: unknown[]): unknown {
    if (slot.inside || slot.globbing.getStore() === true) {
      return original.apply(this, parameters)
    }
    let current = slot.receiver
    if (current !== null) {
      let access = getAccess(base, parameters, slot)
      for (let file of access.read) {
        current.read(file)
      }
      for (let file of access.written) {
        current.write(file)
      }
    }
    slot.inside = true
    try {
      if (name !== 'glob') {
        return original.apply(this, parameters)
      }
      return guardIterator(
        slot.globbing.run(true, () => original.apply(this, parameters)),
        slot,
      )
    } finally {
      slot.inside = false
    }
  }
  Object.defineProperties(wrapper, Object.getOwnPropertyDescriptors(original))
  return wrapper
}

/**
 * Lists the directories a recursive listing reads: the path itself, whether it
 * is a directory or not, and every directory in it. A recursive `readdir`
 * follows links to directories, so with `follow` such a link is listed and
 * walked into by its own path, once per real directory, so a loop of links
 * ends; `opendir` and `glob` do not follow links. `node_modules` is listed but
 * not walked into, as no path in it is a project file.
 *
 * @param file - Absolute path of the listed directory.
 * @param slot - Tracking state of the worker, with the functions as Node made
 *   them.
 * @param follow - Whether the listing follows links to directories.
 * @returns Absolute paths of the directories, the listed path first.
 */
function walkDirectories(
  file: string,
  slot: FileSlot,
  follow: boolean,
): string[] {
  let read = [file]
  let seen = new Set<string>()
  let directories = [file]
  while (directories.length > 0) {
    let directory = directories.shift()!
    let entries: Dirent[] = []
    try {
      seen.add(slot.original.realpathSync(directory))
      entries = slot.original.readdirSync(directory, { withFileTypes: true })
    } catch {}
    for (let entry of entries) {
      let child = path.join(directory, entry.name)
      let walked = entry.isDirectory()
      if (follow && entry.isSymbolicLink()) {
        try {
          walked = slot.original.statSync(child).isDirectory()
          if (walked && seen.has(slot.original.realpathSync(child))) {
            read.push(child)
            continue
          }
        } catch {}
      }
      if (walked) {
        read.push(child)
        if (entry.name !== 'node_modules') {
          directories.push(child)
        }
      }
    }
  }
  return read
}

/**
 * Lists a path a copy reads: a file, or a directory with every file and
 * directory in it, outside `node_modules` and `.git`; links in it are listed,
 * not followed.
 *
 * @param file - Absolute path of the source.
 * @param slot - Tracking state of the worker, with the functions as Node made
 *   them.
 * @param read - Receives the paths.
 */
function walk(file: string, slot: FileSlot, read: string[]): void {
  read.push(file)
  let directories: string[] = []
  try {
    if (slot.original.statSync(file).isDirectory()) {
      directories.push(file)
    }
  } catch {}
  while (directories.length > 0) {
    let directory = directories.shift()!
    let entries: Dirent[] = []
    try {
      entries = slot.original.readdirSync(directory, { withFileTypes: true })
    } catch {}
    for (let entry of entries) {
      if (!SKIPPED.has(entry.name)) {
        let child = path.join(directory, entry.name)
        read.push(child)
        if (entry.isDirectory()) {
          directories.push(child)
        }
      }
    }
  }
}

/**
 * Makes the asynchronous iterator `fs.promises.glob` returns run each step as
 * the work of a wrapped `glob`, whose own calls of `node:fs` report nothing.
 *
 * @param result - What `glob` returned: an asynchronous generator, or nothing
 *   for the callback form.
 * @param slot - Tracking state of the worker.
 * @returns An iterator over the same values, or nothing.
 */
function guardIterator(result: unknown, slot: FileSlot): unknown {
  if (result === undefined) {
    return result
  }
  let generator = result as AsyncGenerator<unknown, unknown>
  let guarded: AsyncIterableIterator<unknown> = {
    return: value => slot.globbing.run(true, () => generator.return(value)),
    next: () => slot.globbing.run(true, () => generator.next()),
    [Symbol.asyncIterator]: () => guarded,
  }
  return guarded
}

/**
 * Finds the directory a glob pattern walks: where its fixed segments end, one
 * level up for every `..` after them, since each may leave a directory the
 * pattern entered.
 *
 * @param pattern - Pattern as `fs.glob` takes it, with `/` between segments.
 * @param cwd - Absolute path the pattern is relative to.
 * @returns Absolute path of the directory.
 */
function getGlobBase(pattern: string, cwd: string): string {
  let segments = pattern.split('/')
  let magic = segments.findIndex(segment => GLOB_MAGIC.test(segment))
  if (magic === -1) {
    return path.resolve(cwd, pattern)
  }
  let base = path.resolve(cwd, segments.slice(0, magic).join('/'))
  for (let segment of segments.slice(magic)) {
    if (segment === '..') {
      base = path.dirname(base)
    }
  }
  return base
}

/**
 * Turns a path argument into an absolute path.
 *
 * @param value - Argument: a string, a `file:` URL or a buffer is a path;
 *   anything else, such as a descriptor, is not.
 * @returns The absolute path, or null when the argument is no path.
 */
function toPath(value: unknown): string | null {
  let file: string | null = null
  if (typeof value === 'string') {
    file = value
  } else if (value instanceof URL) {
    file = value.protocol === 'file:' ? fileURLToPath(value) : null
  } else if (Buffer.isBuffer(value)) {
    file = value.toString()
  }
  return file === null ? null : path.resolve(file)
}

/**
 * Tells whether flags of `open` leave the content of an existing file as it is,
 * so what code reads from it is an input.
 *
 * @param flags - Flags argument of `open`.
 * @returns Whether the flags neither create, empty nor append to the file.
 */
function isReadOpen(flags: unknown): boolean {
  if (typeof flags === 'number') {
    return (flags & WRITE_BITS) === 0
  }
  return typeof flags !== 'string' || !/[aw]/u.test(flags)
}
