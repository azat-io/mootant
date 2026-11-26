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
 * it creates, and what `cp` changes is known once it succeeded (`listCopies`).
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
  rm: [0],
  cp: [],
}

/**
 * Functions of `node:fs` that read the path at the first argument besides the
 * paths they change: the source of a copy, a move or a hard link, and the
 * target of a symbolic link, relative to the link's directory.
 */
const SOURCES = new Set(['copyFile', 'symlink', 'rename', 'link', 'cp'])

/**
 * Functions of `node:fs` that make a directory under a name they choose, with
 * their `Sync` and `fs/promises` variants; the directory is known only from
 * what they give back.
 */
const CREATORS = new Set(['mkdtempDisposable', 'mkdtemp'])

/**
 * Functions of `node:fs` whose asynchronous forms may go on calling functions
 * of `node:fs` after they return, as Node writes their walk in JavaScript; the
 * calls of that walk report nothing, as what it reads and changes is reported
 * apart, and the callback of the callback form runs outside it.
 */
const WALKERS = new Set(['glob', 'cp'])

/**
 * Directories a recursive copy of a directory does not walk into for the files
 * it reads.
 */
const SKIPPED = new Set(['.git'])

/**
 * Directories a recursive copy with a `filter` does not walk into either: the
 * walk cannot ask the filter, which often leaves installed packages out, and a
 * copy of a project that does would read every one of them.
 */
const FILTERED_SKIPPED = new Set([...SKIPPED, 'node_modules'])

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
 * Global slot of the tracking state of the process.
 */
const SLOT = Symbol.for('mootant.file-reads')

/**
 * `path.resolve` as this module loads: code it watches may replace it, as a
 * test's `jest.spyOn(path, ...)` does, and must not see the calls made here.
 */
let resolvePath = path.resolve

/**
 * `path.dirname` as this module loads.
 */
let getDirectory = path.dirname

/**
 * `path.join` as this module loads.
 */
let joinPaths = path.join

/**
 * `fileURLToPath` as this module loads.
 */
let readFileUrl = fileURLToPath

/**
 * Receiver of the paths a test process reads and writes.
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
 * Tracking state of a test process.
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
   * Whether the asynchronous work of a wrapped `glob` or `cp` runs, whose own
   * calls of `node:fs` report nothing, as what it reads and changes is reported
   * apart.
   */
  walking: AsyncLocalStorage<boolean>

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
 * `.git`, and outside `node_modules` too with a `filter`, whose copies it
 * writes once it succeeded, unless a `filter`, `force: false` or
 * `verbatimSymlinks` may make a copy other than its source (`listCopies`);
 * `mkdir` writes only the directories that did not exist. `mkdtemp` and
 * `mkdtempDisposable` write the directory they made once they give it. A
 * recursive `readdir` or `opendir` reads the directory and every directory in
 * it, each listed by its own names, so adding a file anywhere in the tree
 * changes what was read; `readdir` also reads the directories behind the links
 * it follows. `glob` reads the same of the directory where each pattern's fixed
 * part ends. Calls of `node:fs` that a wrapped function makes while it runs
 * report nothing, and neither do those of the asynchronous work of `glob` and
 * `cp`, but those of their callbacks do. Descriptors and file handles are not
 * paths and are not reported.
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
      walking: new AsyncLocalStorage(),
      receiver: null,
      inside: false,
    }
    global[SLOT] = slot
    let names = [...READERS, ...Object.keys(WRITERS), ...CREATORS].flatMap(
      name => [name, `${name}Sync`],
    )
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
 * Wraps a function of `node:fs` so it reports its path argument to the current
 * receiver before it runs.
 *
 * @param original - Function to wrap.
 * @param name - Its name, such as `readFileSync`.
 * @param slot - Tracking state of the process.
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
    if (slot.inside || slot.walking.getStore() === true) {
      return original.apply(this, parameters)
    }
    let current = slot.receiver
    let after: ((value: unknown) => void) | null = null
    if (current !== null) {
      let receiver = current
      /**
       * Reporting never reaches the code it watches: a relative path has no
       * absolute form once its working directory is gone, and the call
       * decides.
       */
      try {
        if (CREATORS.has(base)) {
          after = value => {
            let given = (value as { path?: unknown }).path ?? value
            let folder = resolvePath(
              Buffer.isBuffer(given) ? given.toString() : String(given),
            )
            receiver.write(folder)
          }
        } else {
          let access = getAccess(base, parameters, slot)
          for (let file of access.read) {
            receiver.read(file)
          }
          for (let file of access.written) {
            receiver.write(file)
          }
          let copies =
            base === 'cp' ? listCopies(parameters, access.read, slot) : []
          if (copies.length > 0) {
            after = () => {
              for (let copy of copies) {
                receiver.write(copy)
              }
            }
          }
        }
      } catch {}
    }
    /**
     * Calls the function, reporting what `after` lists once it succeeded.
     *
     * @param values - Arguments of the call.
     * @returns What the function returns.
     */
    let call = (values: unknown[]): unknown =>
      after === null ?
        original.apply(this, values)
      : callThen((...given) => original.apply(this, given), values, after)
    slot.inside = true
    try {
      if (!WALKERS.has(name)) {
        return call(parameters)
      }
      let values = leaveWalk(parameters, slot)
      let result = slot.walking.run(true, () => call(values))
      return name === 'glob' ? guardIterator(result, slot) : result
    } finally {
      slot.inside = false
    }
  }
  Object.defineProperties(wrapper, Object.getOwnPropertyDescriptors(original))
  return wrapper
}

/**
 * Calls a function of `node:fs` and runs what to report once it succeeded: with
 * the value of the `Sync` form, the value of the promise of the `fs/promises`
 * form, or what the callback of the callback form gets. A call that fails
 * reports nothing, and its error reaches the code as it would: the promise
 * given back is one that settles as the function's does, so a rejection nobody
 * handles still is one. Reporting never reaches the code it watches.
 *
 * @param call - Calls the function with some arguments.
 * @param parameters - Arguments of the call.
 * @param after - What to report, with what the function gave.
 * @returns What the function returns, or the promise that settles as its own.
 */
function callThen(
  call: (...values: unknown[]) => unknown,
  parameters: unknown[],
  after: (value: unknown) => void,
): unknown {
  /**
   * Reports, keeping any error away from the code.
   *
   * @param value - What the function gave.
   */
  function report(value: unknown): void {
    try {
      after(value)
    } catch {}
  }
  let callback = parameters.at(-1)
  if (typeof callback === 'function') {
    return call(
      ...parameters.slice(0, -1),
      (error: unknown, value: unknown, ...rest: unknown[]) => {
        if (error === null || error === undefined) {
          report(value)
        }
        return Reflect.apply(callback, undefined, [
          error,
          value,
          ...rest,
        ]) as unknown
      },
    )
  }
  /**
   * Waits for the promise of the function and reports its value.
   *
   * @param promise - What the function gave.
   * @returns The value of the promise; its rejection rejects this too.
   */
  async function settle(promise: Promise<unknown>): Promise<unknown> {
    let value = await promise
    report(value)
    return value
  }
  let result = call(...parameters)
  if (result instanceof Promise) {
    return settle(result)
  }
  report(result)
  return result
}

/**
 * Lists the directories a recursive listing reads: the path itself, whether it
 * is a directory or not, and every directory in it. A recursive `readdir`
 * follows links to directories, so with `follow` such a link is listed and
 * walked into by its own path, once per real directory, so a loop of links
 * ends; `opendir` and `glob` do not follow links. `node_modules` is listed but
 * not walked into, as a listing of a project would read every installed package
 * then, while the files of packages count where they are read.
 *
 * @param file - Absolute path of the listed directory.
 * @param slot - Tracking state of the process, with the functions as Node made
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
      let child = joinPaths(directory, entry.name)
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
 * directory in it, outside the skipped directories; links in it are listed, not
 * followed.
 *
 * @param file - Absolute path of the source.
 * @param slot - Tracking state of the process, with the functions as Node made
 *   them.
 * @param skipped - Names of the directories not walked into.
 * @returns Absolute paths, the source first.
 */
function walk(
  file: string,
  slot: FileSlot,
  skipped: ReadonlySet<string>,
): string[] {
  let read = [file]
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
      if (!skipped.has(entry.name)) {
        let child = joinPaths(directory, entry.name)
        read.push(child)
        if (entry.isDirectory()) {
          directories.push(child)
        }
      }
    }
  }
  return read
}

/**
 * Lists the paths a call of a function of `node:fs` that changes paths reads
 * besides them: the source of a copy, a move or a hard link, with every file
 * and directory in a directory `cp` copies, and the target of a symbolic link,
 * relative to the link's directory.
 *
 * @param base - Name of the function without `Sync`, such as `copyFile`.
 * @param parameters - Arguments of the call.
 * @param slot - Tracking state of the process, with the functions as Node made
 *   them.
 * @returns Absolute paths read, none for a function that reads no source.
 */
function listSourceReads(
  base: string,
  parameters: unknown[],
  slot: FileSlot,
): string[] {
  let first = toPath(parameters[0])
  if (first === null || !SOURCES.has(base)) {
    return []
  }
  if (base === 'symlink') {
    let link = toPath(parameters[1])
    return [
      link === null || typeof parameters[0] !== 'string' ?
        first
      : resolvePath(getDirectory(link), parameters[0]),
    ]
  }
  if (base === 'cp') {
    let options: unknown = parameters[2]
    let filtered =
      typeof options === 'object' &&
      options !== null &&
      Reflect.get(options, 'filter') !== undefined
    return walk(first, slot, filtered ? FILTERED_SKIPPED : SKIPPED)
  }
  return [first]
}

/**
 * Lists what a call of `cp` writes once it succeeds: the destination and each
 * file and directory its walk of the source found, under the destination, but a
 * directory that is there before the call, which the copy merges into and whose
 * other entries stay inputs. None is listed with a `filter`, with `force:
 * false`, which keeps a file that is there, or with `verbatimSymlinks`, which
 * keeps a relative link as it is, so a copy of it may lead elsewhere than the
 * link it copies: what such a call may make other than its source stays an
 * input.
 *
 * @param parameters - Arguments of the call.
 * @param read - What the call reads, the source first (`listSourceReads`).
 * @param slot - Tracking state of the process, with the functions as Node made
 *   them.
 * @returns Absolute paths, taken before the call.
 */
function listCopies(
  parameters: unknown[],
  read: readonly string[],
  slot: FileSlot,
): string[] {
  let [source] = read
  let destination = toPath(parameters[1])
  let options = (parameters[2] ?? {}) as {
    verbatimSymlinks?: unknown
    filter?: unknown
    force?: unknown
  }
  if (
    source === undefined ||
    destination === null ||
    options.filter !== undefined ||
    options.force === false ||
    options.verbatimSymlinks === true
  ) {
    return []
  }
  return read
    .map(file => `${destination}${file.slice(source.length)}`)
    .filter(copy => {
      try {
        return !slot.original.statSync(copy).isDirectory()
      } catch {
        return true
      }
    })
}

/**
 * Finds the paths a call of a function of `node:fs` reads and changes when the
 * function reads a path given first: `open` changes the path unless its flags
 * leave the file as it is, a recursive `readdir` or `opendir` reads the path
 * and every directory in it, and any other call reads the path.
 *
 * @param base - Name of the function without `Sync`, such as `readFile`.
 * @param parameters - Arguments of the call.
 * @param slot - Tracking state of the process, with the functions as Node made
 *   them.
 * @returns Paths read and changed, absolute; none when the first argument is no
 *   path, such as a descriptor.
 */
function getReaderAccess(
  base: string,
  parameters: unknown[],
  slot: FileSlot,
): FileAccess {
  let access: FileAccess = { written: [], read: [] }
  let first = toPath(parameters[0])
  if (first === null) {
    return access
  }
  if (base === 'open' && !isReadOpen(parameters[1])) {
    access.written.push(first)
  } else if (
    (base === 'readdir' || base === 'opendir') &&
    Boolean(
      (parameters[1] as { recursive?: unknown } | undefined | null)?.recursive,
    )
  ) {
    access.read.push(...walkDirectories(first, slot, base === 'readdir'))
  } else {
    access.read.push(first)
  }
  return access
}

/**
 * Lists the directories a call of `glob` reads: those each pattern given as a
 * string walks, relative to the `cwd` option, or to the working directory of
 * the process without one.
 *
 * @param parameters - Arguments of the call.
 * @param slot - Tracking state of the process, with the functions as Node made
 *   them.
 * @returns Absolute paths of the directories, pattern by pattern.
 */
function listGlobReads(parameters: unknown[], slot: FileSlot): string[] {
  let read: string[] = []
  let patterns = [parameters[0]].flat()
  let options = parameters[1] as { cwd?: unknown } | undefined
  let cwd = typeof options === 'object' ? toPath(options.cwd) : null
  for (let pattern of patterns) {
    if (typeof pattern === 'string') {
      read.push(
        ...walkDirectories(
          getGlobBase(pattern, cwd ?? process.cwd()),
          slot,
          false,
        ),
      )
    }
  }
  return read
}

/**
 * Lists the paths a call of a function of `node:fs` changes: those at the
 * arguments the function changes, where `mkdir` changes only the directories it
 * creates, the given one first, then each parent that does not exist yet.
 *
 * @param base - Name of the function without `Sync`, such as `writeFile`.
 * @param parameters - Arguments of the call.
 * @param slot - Tracking state of the process, with the functions as Node made
 *   them.
 * @returns Absolute paths changed.
 */
function listWrites(
  base: string,
  parameters: unknown[],
  slot: FileSlot,
): string[] {
  let written: string[] = []
  let indexes = WRITERS[base]!
  for (let index of indexes) {
    let file = toPath(parameters[index])
    if (file === null) {
      continue
    }
    if (base === 'mkdir') {
      while (!slot.original.existsSync(file)) {
        written.push(file)
        file = getDirectory(file)
      }
    } else {
      written.push(file)
    }
  }
  return written
}

/**
 * Makes the asynchronous iterator `fs.promises.glob` returns run each step as
 * the work of a wrapped `glob`, whose own calls of `node:fs` report nothing.
 *
 * @param result - What `glob` returned: an asynchronous generator, or nothing
 *   for the callback form.
 * @param slot - Tracking state of the process.
 * @returns An iterator over the same values, or nothing.
 */
function guardIterator(result: unknown, slot: FileSlot): unknown {
  if (result === undefined) {
    return result
  }
  let generator = result as AsyncGenerator<unknown, unknown>
  let guarded: AsyncIterableIterator<unknown> = {
    return: value => slot.walking.run(true, () => generator.return(value)),
    next: () => slot.walking.run(true, () => generator.next()),
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
    return resolvePath(cwd, pattern)
  }
  let base = resolvePath(cwd, segments.slice(0, magic).join('/'))
  for (let segment of segments.slice(magic)) {
    if (segment === '..') {
      base = getDirectory(base)
    }
  }
  return base
}

/**
 * Finds the paths a call of a function of `node:fs` reads and changes.
 *
 * @param base - Name of the function without `Sync`, such as `readFile`.
 * @param parameters - Arguments of the call.
 * @param slot - Tracking state of the process, with the functions as Node made
 *   them.
 * @returns Paths read and changed, absolute.
 */
function getAccess(
  base: string,
  parameters: unknown[],
  slot: FileSlot,
): FileAccess {
  if (base === 'glob') {
    return { read: listGlobReads(parameters, slot), written: [] }
  }
  if (READERS.has(base)) {
    return getReaderAccess(base, parameters, slot)
  }
  return {
    read: listSourceReads(base, parameters, slot),
    written: listWrites(base, parameters, slot),
  }
}

/**
 * Makes the callback of the callback form of `glob` or `cp`, the last argument,
 * run outside the work of the function, so its own calls of `node:fs` report as
 * those of the code do.
 *
 * @param parameters - Arguments of the call.
 * @param slot - Tracking state of the process.
 * @returns The arguments, with the callback replaced if there is one.
 */
function leaveWalk(parameters: unknown[], slot: FileSlot): unknown[] {
  let callback = parameters.at(-1)
  if (typeof callback !== 'function') {
    return parameters
  }
  return [
    ...parameters.slice(0, -1),
    (...values: unknown[]): unknown =>
      slot.walking.exit(
        () => Reflect.apply(callback, undefined, values) as unknown,
      ),
  ]
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
  } else if (isUrl(value)) {
    file = value.protocol === 'file:' ? readFileUrl(value) : null
  } else if (value instanceof Buffer) {
    file = value.toString()
  }
  return file === null ? null : resolvePath(file)
}

/**
 * Tells whether `node:fs` takes a value as a URL. It checks the shape, not the
 * class, as Node does, so the `URL` of another realm counts too, such as
 * jsdom's in the tests of a Jest project.
 *
 * @param value - Argument of a call.
 * @returns Whether it has a `href` and a `protocol`, and neither `auth` nor
 *   `path`, which a result of the legacy `url.parse` has.
 */
function isUrl(value: unknown): value is URL {
  let url = value as
    | Partial<Record<'protocol' | 'auth' | 'href' | 'path', unknown>>
    | undefined
    | null
  return (
    Boolean(url?.href) &&
    Boolean(url?.protocol) &&
    url?.auth === undefined &&
    url?.path === undefined
  )
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
