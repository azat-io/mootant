import type { LoadFnOutput, LoadHookSync } from 'node:module'

import type { NodeTestHooksData } from '../types/node-test-hooks-data'
import type { SourceSwitcher } from '../types/source-switcher'

import { patchModuleCompile } from './patch-module-compile'
import { createLoadHook } from './create-load-hook'

/**
 * What the hooks switch and where they report.
 */
interface HookOptions {
  /**
   * Receives the absolute path of every module loaded in this thread.
   */
  record(file: string): void

  /**
   * Switcher of module texts of this thread.
   */
  switcher: SourceSwitcher

  /**
   * Data for hooks that run in a thread of their own.
   */
  data: NodeTestHooksData

  /**
   * Prototype of CommonJS modules, `Module.prototype`.
   */
  prototype: object

  /**
   * URL of the module with the hooks for `register()`.
   */
  hooks: URL
}

/**
 * Functions of `node:module` that install module hooks, as much of them as
 * mootant uses.
 */
interface ModuleApi {
  /**
   * Registers hooks that run in a thread of their own (Node 20.6 and later).
   */
  register(specifier: URL, options: { data: NodeTestHooksData }): void

  /**
   * Registers hooks that run in the thread that loads (Node 22.15, 23.5 and
   * later).
   */
  registerHooks?(hooks: { load: LoadHookSync }): unknown
}

/**
 * Installs the module hooks that switch modules as they load: a synchronous
 * `load` hook through `registerHooks` where Node has it, else the hooks module
 * through `register()`, whose hooks run in a thread of their own and see no
 * `require()`. `Module.prototype._compile` is patched on every version, since a
 * loader such as tsx compiles CommonJS from a text it reads again; the
 * synchronous hook leaves CommonJS to it, so Node lists the exports of a
 * CommonJS module from its own text. Hooks installed first run closest to
 * Node's own loader, so loaders the project adds later, such as tsx, compile
 * the switched text.
 *
 * @param api - `node:module`.
 * @param options - What to switch and where to report.
 * @returns `sync` for `registerHooks`, `async` for `register()`.
 */
export function installModuleHooks(
  api: ModuleApi,
  options: HookOptions,
): 'async' | 'sync' {
  let { switcher, record } = options
  patchModuleCompile(options.prototype, switcher, record)
  if (typeof api.registerHooks !== 'function') {
    api.register(options.hooks, { data: options.data })
    return 'async'
  }
  let apply = createLoadHook(switcher, record, false)
  api.registerHooks({
    load: (url, context, next): LoadFnOutput => apply(url, next(url, context)),
  })
  return 'sync'
}
