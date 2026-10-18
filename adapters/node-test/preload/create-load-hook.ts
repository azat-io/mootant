import type { LoadFnOutput } from 'node:module'

import { fileURLToPath } from 'node:url'

import type { SourceSwitcher } from '../types/source-switcher'

/**
 * Query parameter of the URLs node:test gives the modules `mock.module()`
 * generates in place of a file.
 */
const MOCK_PARAMETER = 'node-test-mock'

/**
 * Creates the part of a module `load` hook that runs after the next hook: it
 * reports every file the loader loads and replaces the source of a module the
 * switcher changes, keeping its format. A result without source, as for
 * CommonJS that Node's `require` reads itself, stays as it is; the patched
 * `Module.prototype._compile` switches that. Without `commonjs`, a CommonJS
 * result with source stays as it is too: Node lists the exports of such a
 * module from the text the hook returns, which a switched text hides, and
 * compiles it through `_compile` anyway (`registerHooks`). A module that
 * `mock.module()` generates is neither reported nor switched, since its text is
 * not the file's.
 *
 * @param switcher - Switcher of module texts.
 * @param record - Receives the absolute path of every `file:` module loaded.
 * @param commonjs - Whether to switch CommonJS modules with source here.
 * @returns Function of the URL and the next hook's result that returns the
 *   result to give Node.
 */
export function createLoadHook(
  switcher: SourceSwitcher,
  record: (file: string) => void,
  commonjs: boolean,
): (url: string, result: LoadFnOutput) => LoadFnOutput {
  return (url, result) => {
    if (!url.startsWith('file:')) {
      return result
    }
    let parsed = new URL(url)
    if (parsed.searchParams.has(MOCK_PARAMETER)) {
      return result
    }
    let file = fileURLToPath(parsed)
    record(file)
    let source = result.source as LoadFnOutput['source'] | null
    if (
      source === undefined ||
      source === null ||
      (!commonjs && result.format === 'commonjs') ||
      !switcher.has(file)
    ) {
      return result
    }
    let code =
      typeof source === 'string' ? source : (
        Buffer.from(source as Uint8Array).toString('utf8')
      )
    let text = switcher.switch(file, code)
    return text === null ? result : { ...result, source: text }
  }
}
