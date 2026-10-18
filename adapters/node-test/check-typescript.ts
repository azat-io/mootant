import { readFileSync } from 'node:fs'
import path from 'node:path'

import { listPackageFiles } from './list-package-files'

/**
 * Specifier of a module other than tsx that compiles TypeScript on load, such
 * as `ts-node/esm`, `ts-node/register` or `@swc-node/register`. These compile
 * through `--require` hooks or legacy `--loader` hooks, past mootant's module
 * hooks, so mootant cannot switch what they compile.
 */
const OTHER_TYPESCRIPT_LOADER =
  /(?:^|[/\\])(?:esbuild-register|ts-node|tsm|@swc-node|@esbuild-kit)(?:$|[/@\\])/u

/**
 * Specifier of tsx or of a module inside it.
 */
const TSX = /(?:^|[/\\])tsx(?:$|[/@\\])/u

/**
 * Pattern of the paths of TypeScript files.
 */
const TYPESCRIPT_FILE = /\.[cm]?ts$/u

/**
 * Checks that the test processes can load the TypeScript files of a run and
 * that mootant can switch them: they must load through Node's type stripping or
 * tsx, not through another loader such as ts-node; without type stripping tsx
 * must compile them; and tsx must not compile them as CommonJS, since it then
 * reads them again past mootant's module hooks (`.cts` files, or `.ts` files
 * whose nearest `package.json` lacks `"type": "module"`).
 *
 * @param input - What the test processes load.
 * @param input.root - Project root, which the messages name.
 * @param input.version - Version of Node, such as `v20.19.0`.
 * @param input.strips - Whether Node strips TypeScript types itself.
 * @param input.loaders - Modules Node flags load before the test file.
 * @param input.files - Absolute paths of the test files and switched files of
 *   the run.
 * @returns A sentence naming the problem, or null.
 */
export function checkTypeScript(input: {
  loaders: readonly string[]
  files: readonly string[]
  version: string
  strips: boolean
  root: string
}): string | null {
  let files = input.files.filter(file => TYPESCRIPT_FILE.test(file))
  if (files.length === 0) {
    return null
  }
  let other = input.loaders.find(loader => OTHER_TYPESCRIPT_LOADER.test(loader))
  if (other !== undefined) {
    return `mootant switches TypeScript files only through Node's type stripping or tsx (--import tsx), so it cannot run the tests of ${input.root} with ${other}.`
  }
  let tsx = input.loaders.some(loader => TSX.test(loader))
  if (!tsx && !input.strips) {
    return `Node ${input.version} cannot run the TypeScript files of ${input.root} without a loader; add tsx (--import tsx) to the test command or use Node 22.18 or later.`
  }
  if (!tsx) {
    return null
  }
  let packages = new Map<string, string[]>()
  let types = new Map<string, unknown>()
  let commonjs = files.find(
    file =>
      file.endsWith('.cts') ||
      (file.endsWith('.ts') &&
        readPackageType(
          listPackageFiles(path.dirname(file), packages).at(-1)!,
          types,
        ) !== 'module'),
  )
  if (commonjs !== undefined) {
    return `mootant cannot switch TypeScript files that tsx loads as CommonJS, such as ${path.relative(input.root, commonjs)}; add "type": "module" to its package.json or run the tests with Node's type stripping instead of tsx.`
  }
  return null
}

/**
 * Reads the `type` field of a `package.json`.
 *
 * @param file - Absolute path of the `package.json`, which may be missing.
 * @param cache - Fields read before, by path; filled here.
 * @returns The field, or null when the file or the field is missing.
 */
function readPackageType(file: string, cache: Map<string, unknown>): unknown {
  if (!cache.has(file)) {
    let type: unknown = null
    try {
      let manifest = JSON.parse(readFileSync(file, 'utf8')) as {
        type?: unknown
      }
      type = manifest.type ?? null
    } catch {}
    cache.set(file, type)
  }
  return cache.get(file)
}
