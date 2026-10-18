import path from 'node:path'

/**
 * Extension of a JavaScript or TypeScript file.
 */
const SCRIPT_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/u

/**
 * Last extension of a file name, such as `.ts` or `.vue`.
 */
const EXTENSION_PATTERN = /\.[^.]+$/u

/**
 * Suffix of a test file name before its extension.
 */
const TEST_SUFFIX_PATTERN = /\.(?:spec|test)$/u

/**
 * Suffix of a Svelte module that uses runes, such as `tally.svelte.ts`.
 */
const SVELTE_SUFFIX_PATTERN = /\.svelte$/u

/**
 * Directory names that hold tests apart from the sources they mirror.
 */
const TEST_DIRECTORIES = new Set([
  '__tests__',
  'tests',
  'specs',
  'test',
  'spec',
])

/**
 * Ranks a test file by how likely it is to kill a mutant of a module, before
 * cost: lower runs first.
 *
 * - 0: the test file is named after the module and mirrors its path;
 * - 1: the test file is named after the module and imports it directly;
 * - 2: the test file imports the module directly;
 * - 3: the test file is named after the module only, such as a test of another
 *   module of the same name in another directory or package;
 * - 4: any other test file, such as one that reaches the module through other
 *   modules.
 *
 * A test file is named after a module when its name without the extension and
 * without a `.test` or `.spec` suffix equals the module's name without the
 * extension, a `.svelte` suffix of a Svelte module dropped from both; a module
 * named `index` is named by its directory, or by `index` in a mirrored path
 * only. A test file mirrors the module's path when, past the directories both
 * paths share from the project root and without a leading and a trailing test
 * directory (`test`, `tests`, `__tests__`, `spec`, `specs`) of the test file,
 * its directories equal the module's, or, when a leading test directory took
 * the place of the module's first directory, the module's without that one: a
 * test file next to the module, in `__tests__` next to it, or in a test tree
 * that mirrors the source tree (`src/a/b.ts` and `test/a/b.test.ts`;
 * `core/a/b.ts` and `test/core/a/b.test.ts`). A test file imports the module
 * directly when a target names the module: the same path, the path with another
 * JavaScript or TypeScript extension (`./a.js` for `a.ts`), or a path without
 * an extension, for `a.ts` or `a/index.ts` alike.
 *
 * @param module - Absolute path of the mutated module.
 * @param file - Absolute path of the test file.
 * @param context - What the test file imports and the project root.
 * @param context.imports - Absolute paths the test file imports through
 *   relative specifiers, as written, without resolving extensions.
 * @param context.root - Project root.
 * @returns Rank from 0 to 4.
 */
export function rankTestFile(
  module: string,
  file: string,
  context: { imports: readonly string[]; root: string },
): number {
  let moduleName = getModuleName(path.basename(module))
  let testName = getTestName(path.basename(file))
  let mirrored = isMirrored(module, file, context.root)
  let named =
    moduleName === 'index' ?
      testName === path.basename(path.dirname(module)) ||
      (testName === 'index' && mirrored)
    : testName === moduleName
  if (named && mirrored) {
    return 0
  }
  let imported = context.imports.some(target => isModuleTarget(target, module))
  if (imported) {
    return named ? 1 : 2
  }
  return named ? 3 : 4
}

/**
 * Tells whether a test file mirrors the path of a module (see `rankTestFile`).
 *
 * @param module - Absolute path of the module.
 * @param file - Absolute path of the test file.
 * @param root - Project root.
 * @returns Whether the directories mirror each other.
 */
function isMirrored(module: string, file: string, root: string): boolean {
  let sources = listDirectories(module, root)
  let tests = listDirectories(file, root)
  while (sources.length > 0 && tests.length > 0 && sources[0] === tests[0]) {
    sources.shift()
    tests.shift()
  }
  let separate = tests.length > 0 && TEST_DIRECTORIES.has(tests[0]!)
  if (separate) {
    tests.shift()
  }
  if (tests.length > 0 && TEST_DIRECTORIES.has(tests.at(-1)!)) {
    tests.pop()
  }
  let joined = tests.join('/')
  return (
    joined === sources.join('/') ||
    (separate && joined === sources.slice(1).join('/'))
  )
}

/**
 * Tells whether an import target names a module (see `rankTestFile`).
 *
 * @param target - Absolute import target as written.
 * @param module - Absolute path of the module.
 * @returns Whether the target names the module.
 */
function isModuleTarget(target: string, module: string): boolean {
  let stem = module.replace(SCRIPT_EXTENSION_PATTERN, '')
  if (target === module || target === stem) {
    return true
  }
  if (SCRIPT_EXTENSION_PATTERN.test(target)) {
    return target.replace(SCRIPT_EXTENSION_PATTERN, '') === stem
  }
  return path.basename(stem) === 'index' && target === path.dirname(stem)
}

/**
 * Lists the directories of a file from the project root.
 *
 * @param file - Absolute path of the file.
 * @param root - Project root.
 * @returns Directory names, outermost first.
 */
function listDirectories(file: string, root: string): string[] {
  return path
    .relative(root, path.dirname(file))
    .split(path.sep)
    .filter(part => part !== '')
}

/**
 * Names a test file for matching: its file name without the extension, without
 * a `.test` or `.spec` suffix and without a `.svelte` suffix.
 *
 * @param base - File name of the test file.
 * @returns Name of the test file.
 */
function getTestName(base: string): string {
  return base
    .replace(EXTENSION_PATTERN, '')
    .replace(TEST_SUFFIX_PATTERN, '')
    .replace(SVELTE_SUFFIX_PATTERN, '')
}

/**
 * Names a module for matching: its file name without the extension and without
 * a `.svelte` suffix.
 *
 * @param base - File name of the module.
 * @returns What test file names are compared with.
 */
function getModuleName(base: string): string {
  return base.replace(EXTENSION_PATTERN, '').replace(SVELTE_SUFFIX_PATTERN, '')
}
