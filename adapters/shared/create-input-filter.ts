import { userInfo, tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'
import path from 'node:path'

/**
 * Separator of path segments as this module loads.
 */
let { sep } = path

/**
 * Makes the filter that tells which paths test code reads count as inputs of
 * its verdicts. A path counts wherever it is, outside the project root, in the
 * temporary directory and in `node_modules` too, but not when it is a
 * `node_modules` directory itself, whose names an install changes as the files
 * that tell what was installed show, when it lies in a `node_modules/.cache`
 * directory, where tools keep the caches they write as they run, mootant's own
 * among them, when it lies in mootant's work directory, when it is a directory
 * that holds the root, as tools look through those on their way up to their
 * configuration while their names change with whatever lies beside the project,
 * or when it lies in the cache tsx keeps in the temporary directory, `tsx-<user
 * id>` and the `tsx` of older versions, which follows the sources and the
 * `tsconfig` files that count while any process that compiles something new
 * changes it. What the code wrote or made itself is left to `trackFileInputs`.
 * The directories are taken now, before test code runs, as given and by their
 * real paths, and those that hold the root also in the other form of the
 * temporary directory when the root lies in it, so a test that changes `TMPDIR`
 * or replaces a function of `node:path` changes nothing; a call of the filter
 * compares strings only.
 *
 * @param places - Where the run is.
 * @param places.directory - Work directory of the run.
 * @param places.root - Project root.
 * @returns Whether an absolute path that was read counts.
 */
export function createInputFilter(places: {
  directory: string
  root: string
}): (file: string) => boolean {
  let { root } = places
  let temporary = listForms(path.resolve(tmpdir()))
  let inWork = createMatcher(listForms(places.directory))
  let { geteuid } = process
  let user = geteuid === undefined ? userInfo().username : geteuid()
  let inTsx = createMatcher(
    temporary.flatMap(directory => [
      path.join(directory, `tsx-${user}`),
      path.join(directory, 'tsx'),
    ]),
  )
  let above = new Set(
    listRootForms(root, temporary).flatMap(form => [...listAbove(form)]),
  )
  let modules = `${sep}node_modules`
  let caches = `${modules}${sep}.cache`
  return file =>
    !file.endsWith(modules) &&
    !file.endsWith(caches) &&
    !file.includes(`${caches}${sep}`) &&
    !above.has(file) &&
    !inWork(file) &&
    !inTsx(file)
}

/**
 * Lists the forms of the root: as given, by its real path, and each of those in
 * the other form of the temporary directory when it lies in one, such as
 * `/var/folders/…` for `/private/var/folders/…` on macOS.
 *
 * @param root - Project root.
 * @param temporary - Forms of the temporary directory.
 * @returns The forms, each once.
 */
function listRootForms(root: string, temporary: readonly string[]): string[] {
  let forms = listForms(root)
  let translated = forms.flatMap(form => {
    let holder = temporary.find(directory => createMatcher([directory])(form))
    return holder === undefined ?
        []
      : temporary.map(other => `${other}${form.slice(holder.length)}`)
  })
  return [...new Set([...forms, ...translated])]
}

/**
 * Lists the directories that hold a path, up to the root of the file system.
 *
 * @param file - Absolute path.
 * @returns The directories, not the path itself.
 */
function listAbove(file: string): Set<string> {
  let above = new Set<string>()
  let current = file
  let parent = path.dirname(current)
  while (parent !== current) {
    above.add(parent)
    current = parent
    parent = path.dirname(current)
  }
  return above
}

/**
 * Makes a test of whether a path is one of some directories or lies in one.
 *
 * @param directories - Absolute directories.
 * @returns The test.
 */
function createMatcher(
  directories: readonly string[],
): (file: string) => boolean {
  let prefixes = directories.map(directory => `${directory}${sep}`)
  return file =>
    directories.includes(file) ||
    prefixes.some(prefix => file.startsWith(prefix))
}

/**
 * Lists a directory as given and by its real path, which differ for
 * `/var/folders/…` and `/private/var/folders/…` on macOS.
 *
 * @param directory - Absolute path.
 * @returns Both forms, the same path twice when they do not differ, or only the
 *   given one when the directory is missing.
 */
function listForms(directory: string): string[] {
  try {
    return [directory, realpathSync(directory)]
  } catch {
    return [directory]
  }
}
