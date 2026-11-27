import { createEnvironmentProxy } from '../../shared/create-environment-proxy'
import { VALUE_PREFIXES } from './value-prefixes'
import { watchProperty } from './watch-property'

/**
 * Tracking of the values of one worker state.
 */
interface ValuesSlot {
  /**
   * Receiver of the names read, that of the runner of the file that runs now.
   */
  record(name: string): void

  /**
   * Names every receiver gets at once: `defines=`, the defines given as code
   * with every provided value and environment variable, the defines that are
   * not plain properties, and every value when a custom snapshot environment
   * may read them before the runner exists.
   */
  names: Set<string>
}

/**
 * Name of a read of every provided value.
 */
const ALL_PROVIDED = `${VALUE_PREFIXES.provide}*`

/**
 * Name of a listing of every environment variable (`trackEnvironment`).
 */
const ALL_VARIABLES = '*'

/**
 * Key of the slot on Vitest's worker state that keeps its tracking.
 */
const VALUES_SLOT = Symbol.for('mootant.vitest.values')

/**
 * Makes the values of `provide` and `define` report what code reads, under the
 * names of `VALUE_PREFIXES`. The provided context of the worker state, which
 * `inject` reads on every call, and its alias in the state's context are
 * replaced with a proxy that reports a key read, tested or asked for its
 * descriptor, a missing one too, and `provide=*` when code lists them, but
 * never mootant's own options. Each define Vitest set as a plain property, on
 * `globalThis` or, for a key with dots, on the object that holds its last part,
 * is a getter that reports its first read (`wrapDefine`); `in`, `Object.keys`
 * and descriptors call none, as the names count under `defines=`. Defines of
 * `import.meta` are left to `trackMetaDefines`. Vitest evaluates a define given
 * as code before the runner exists, and that code may read and change anything,
 * or hold `process.env` itself, so such a define is reported at once with
 * `provide=*` and `*`. So is a define that is not such a property, without
 * them, and every value when the project has a custom snapshot environment,
 * which Vitest may load before the runner. The tracking is installed once per
 * worker state; a later receiver on the same state takes it over and gets those
 * names too.
 *
 * @param state - Vitest's worker state.
 * @param project - Defines and snapshot environment of the project.
 * @param project.defines - Defines Vitest set as globals (`defines` of the
 *   serialized configuration).
 * @param project.scripted - Defines Vitest ran as a script
 *   (`listScriptDefines`), by key, with whether each value is code.
 * @param project.snapshotEnvironment - Custom snapshot environment, if any.
 * @param record - Receives the names read.
 */
export function trackValues(
  state: { ctx: { providedContext: object }; providedContext: object },
  project: {
    scripted: Readonly<Record<string, boolean>>
    defines: Record<string, unknown>
    snapshotEnvironment?: string
  },
  record: (name: string) => void,
): void {
  let slot = Reflect.get(state, VALUES_SLOT) as ValuesSlot | undefined
  if (slot === undefined) {
    let created: ValuesSlot = {
      names: new Set([VALUE_PREFIXES.defines]),
      record,
    }
    let early = project.snapshotEnvironment !== undefined
    if (early) {
      created.names.add(ALL_PROVIDED)
    }
    state.providedContext = createEnvironmentProxy(state.providedContext, {
      record: name => {
        created.record(`${VALUE_PREFIXES.provide}${name}`)
      },
      ignored: new Set(['mootant']),
      listing: false,
    })
    state.ctx.providedContext = state.providedContext
    let defines = [
      ...Object.keys(project.defines).map(key => [key, false] as const),
      ...Object.entries(project.scripted),
    ]
    for (let [key, code] of defines) {
      let name = `${VALUE_PREFIXES.define}${key}`
      if (code) {
        created.names.add(name).add(ALL_PROVIDED).add(ALL_VARIABLES)
        continue
      }
      let tracked =
        key.startsWith('import.meta.') ||
        wrapDefine(key, () => {
          created.record(name)
        })
      if (early || !tracked) {
        created.names.add(name)
      }
    }
    Reflect.set(state, VALUES_SLOT, created)
    slot = created
  }
  slot.record = record
  for (let name of slot.names) {
    record(name)
  }
}

/**
 * Watches the plain property a define of Vitest set (`watchProperty`): on
 * `globalThis`, or for a key with dots on the object that holds its last part,
 * found through plain properties only.
 *
 * @param key - Key of the define, its parts split by dots.
 * @param report - Reports the first read.
 * @returns Whether the define was a plain property and is watched now.
 */
function wrapDefine(key: string, report: () => void): boolean {
  let path = key.split('.')
  let last = path.pop()!
  let holder: object = globalThis
  for (let part of path) {
    let next = Reflect.getOwnPropertyDescriptor(holder, part)?.value as unknown
    if (typeof next !== 'object' || next === null) {
      return false
    }
    holder = next
  }
  return watchProperty(holder, last, report)
}
