import type { MutantRuntime } from '../../types/adapter/mutant-runtime'

import { createHitLimitError } from './create-hit-limit-error'
import { RUNTIME_GLOBAL } from './runtime-global'

/**
 * Installs the mutant runtime as `globalThis.__mootant`, where switched code
 * calls `hit` at every mutant site. A runtime already installed in the process
 * is returned as is, since switched code may already hold it. A new runtime
 * starts with the original code active, no coverage and no hit limit.
 *
 * @returns The runtime of the process.
 */
export function installMutantRuntime(): MutantRuntime {
  let existing = Reflect.get(globalThis, RUNTIME_GLOBAL) as
    MutantRuntime | undefined
  if (existing !== undefined) {
    return existing
  }
  let runtime: MutantRuntime = {
    hit(id) {
      runtime.hits += 1
      if (runtime.hits > runtime.hitLimit) {
        throw createHitLimitError(id, runtime.hitLimit)
      }
      if (runtime.coverage !== null) {
        runtime.coverage.add(id)
      }
      if (runtime.active === id) {
        runtime.reached = true
        return true
      }
      return false
    },
    hitLimit: Infinity,
    coverage: null,
    reached: false,
    active: null,
    hits: 0,
  }
  Reflect.set(globalThis, RUNTIME_GLOBAL, runtime)
  return runtime
}
