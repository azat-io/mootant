import type { LoadFnOutput, LoadHook } from 'node:module'

import type { NodeTestHooksData } from '../types/node-test-hooks-data'

import { createSourceSwitcher } from './create-source-switcher'
import { createRecordWriter } from './create-record-writer'
import { createFileRecorder } from './create-file-recorder'
import { createLoadHook } from './create-load-hook'

/**
 * Part of the `load` hook after the next hook, once `initialize` ran.
 */
let apply: ((url: string, result: LoadFnOutput) => LoadFnOutput) | null = null

/**
 * Prepares the hooks in their thread with the data the preload passed to
 * `register()`.
 *
 * @param data - Switch plan, test file and out file.
 */
export function initialize(data: NodeTestHooksData): void {
  let write = createRecordWriter(data.out)
  apply = createLoadHook(
    createSourceSwitcher({ plan: data.plan, main: data.main, write }),
    createFileRecorder(write, 'load'),
    true,
  )
}

/**
 * Loads a module through the next hook and switches its text (Node versions
 * without `registerHooks`, where hooks run in a thread of their own).
 *
 * @param url - URL of the module.
 * @param context - Format, conditions and import attributes of the load.
 * @param next - Hook that loads the module after this one, Node's own last.
 * @returns Result of the next hook, with the switched text if any.
 */
export async function load(
  url: string,
  context: Parameters<LoadHook>[1],
  next: Parameters<LoadHook>[2],
): Promise<LoadFnOutput> {
  return apply!(url, await next(url, context))
}
