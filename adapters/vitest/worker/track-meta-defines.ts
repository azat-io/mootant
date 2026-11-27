import { VALUE_PREFIXES } from './value-prefixes'
import { watchProperty } from './watch-property'

/**
 * Module evaluator of Vite's module runner, as far as it is used here.
 */
interface Evaluator {
  /**
   * Runs the code of a module that Vite transformed, with the context it gets,
   * its `import.meta` among it.
   */
  runInlinedModule(
    context: Record<string, unknown>,
    code: string,
    module: unknown,
  ): Promise<unknown>
}

/**
 * Tracking of the defines of `import.meta` of one worker state.
 */
interface MetaSlot {
  /**
   * Receiver of the names read, that of the runner of the file that runs now.
   */
  record(name: string): void
}

/**
 * Key under which Vite's module runner gives a module its `import.meta`
 * (`ssrImportMetaKey` of `vite/module-runner`).
 */
const IMPORT_META_KEY = '__vite_ssr_import_meta__'

/**
 * Key of the slot on Vitest's worker state that keeps the tracking.
 */
const META_SLOT = Symbol.for('mootant.vitest.meta')

/**
 * Start of the keys of the defines of `import.meta`.
 */
const META_PREFIX = 'import.meta.'

/**
 * Makes the defines of `import.meta` report their first read in the modules
 * Vitest evaluates from now on. Vitest's script keeps them in `metaDefines` of
 * the worker state, which its module evaluator copies into the `import.meta` of
 * each module before the module runs: they are taken out of it, and the wrapped
 * evaluator puts them on the `import.meta` of each module itself, as Vitest
 * would, watched until the first read of the unit reports one
 * (`watchProperty`), and plain once it did. Nothing changes when the module
 * runner has no evaluator to wrap or a define is not in `metaDefines`. The
 * tracking is installed once per worker state; a later receiver on the same
 * state takes it over.
 *
 * @param state - Vitest's worker state.
 * @param runner - Module runner Vitest gave the test runner (`moduleRunner`).
 * @param input - Defines to track and the receiver of the names read.
 * @param input.keys - Keys of the defines, such as `import.meta.version`.
 * @param input.record - Receives the names read, such as
 *   `define=import.meta.version`.
 * @returns Whether the defines are tracked.
 */
export function trackMetaDefines(
  state: { metaDefines?: Record<string, unknown> },
  runner: { evaluator?: Partial<Evaluator> } | undefined,
  input: { record(name: string): void; keys: readonly string[] },
): boolean {
  let slot = Reflect.get(state, META_SLOT) as undefined | MetaSlot
  if (slot !== undefined) {
    slot.record = input.record
    return true
  }
  let evaluator = runner?.evaluator
  let defines = state.metaDefines ?? {}
  let parts = input.keys.map(key => key.slice(META_PREFIX.length))
  if (
    typeof evaluator?.runInlinedModule !== 'function' ||
    parts.some(part => !Object.hasOwn(defines, part))
  ) {
    return false
  }
  let run = evaluator.runInlinedModule
  let created: MetaSlot = { record: input.record }
  let taken = parts.map(part => [part, defines[part]] as const)
  let unread = new Set(parts)
  for (let part of parts) {
    Reflect.deleteProperty(defines, part)
  }
  evaluator.runInlinedModule = (context, code, module) => {
    let meta = context[IMPORT_META_KEY] as Record<string, unknown>
    for (let [part, value] of taken) {
      let path = part.split('.')
      let last = path.pop()!
      let target = meta
      for (let segment of path) {
        // eslint-disable-next-line typescript/prefer-nullish-coalescing -- Vitest's copy replaces any falsy value.
        target[segment] ||= {}
        target = target[segment] as Record<string, unknown>
      }
      target[last] = value
      if (unread.has(part)) {
        watchProperty(target, last, () => {
          unread.delete(part)
          created.record(`${VALUE_PREFIXES.define}${META_PREFIX}${part}`)
        })
      }
    }
    return run.call(evaluator, context, code, module)
  }
  Reflect.set(state, META_SLOT, created)
  return true
}
