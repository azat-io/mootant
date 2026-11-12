import type { LoadFnOutput } from 'node:module'

import { readPackageType } from '../../shared/read-package-type'

/**
 * Format of the translator Node keeps for CommonJS that `require(esm)` reaches:
 * it lists the exports of the module from the source it gets, then loads the
 * module through the CommonJS loader, so through `Module.prototype._compile`.
 */
const COMMONJS_LOADER_FORMAT = 'commonjs-sync'

/**
 * Creates the step of the synchronous `load` hook that sends CommonJS modules
 * through Node's CommonJS loader, for Node versions that otherwise compile
 * CommonJS past `Module.prototype._compile` once the hook is registered: the
 * result gets the format of Node's own route through that loader, which lists
 * the exports from the unchanged text and compiles the module through
 * `_compile`, whose patch switches it, as later Node versions do themselves.
 * Every CommonJS module that would load so in plain Node gets it, switched or
 * not, since in a `require()` cycle a module compiled past the CommonJS loader
 * would run a second time instead of giving its partial exports: a module with
 * a source Node read itself for the ES module loader (a `Buffer`; the CommonJS
 * loader reads text, and loaders in a thread of their own send copies, whose
 * `require()` calls Node then leaves to them), from a `file:` URL without a
 * query, in a `.cjs` file or a `.js` file whose nearest `package.json` does not
 * say `"type": "module"`, since the CommonJS loader takes the format from those
 * again and would not keep one a hook chose.
 *
 * @param findPackage - `module.findPackageJSON`: the path of the nearest
 *   `package.json` of a URL, if any.
 * @returns Function of the URL and the result of the next hook that returns the
 *   result to give Node instead, or null to keep it.
 */
export function createCommonJsRoute(
  findPackage: (url: string) => undefined | string,
): (url: string, result: LoadFnOutput) => LoadFnOutput | null {
  let types = new Map<string, unknown>()
  return (url, result) => {
    if (
      result.format !== 'commonjs' ||
      !Buffer.isBuffer(result.source) ||
      !url.startsWith('file:')
    ) {
      return null
    }
    let { pathname, search } = new URL(url)
    if (search !== '') {
      return null
    }
    let manifest = pathname.endsWith('.js') ? findPackage(url) : undefined
    let commonjs =
      pathname.endsWith('.cjs') ||
      (pathname.endsWith('.js') &&
        (manifest === undefined ||
          readPackageType(manifest, types) !== 'module'))
    return commonjs ? { ...result, format: COMMONJS_LOADER_FORMAT } : null
  }
}
