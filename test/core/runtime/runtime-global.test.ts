import { describe, expect, it } from 'vitest'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { getSiteCheck } from '../../../core/instrument/get-site-check'
import { RUNTIME_GLOBAL } from '../../../core/runtime/runtime-global'

describe('rUNTIME_GLOBAL', () => {
  it('names the global that site checks and the runtime share', () => {
    let runtime = installMutantRuntime()

    expect(RUNTIME_GLOBAL).toBe('__mootant')
    expect(Reflect.get(globalThis, RUNTIME_GLOBAL)).toBe(runtime)
    expect(getSiteCheck('m1')).toContain(`globalThis.${RUNTIME_GLOBAL}?.hit(`)

    Reflect.deleteProperty(globalThis, RUNTIME_GLOBAL)
  })
})
