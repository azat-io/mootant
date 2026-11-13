import { describe, expect, it } from 'vitest'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { getSiteSyntax } from '../../../core/instrument/get-site-syntax'
import { RUNTIME_GLOBAL } from '../../../core/runtime/runtime-global'

describe('rUNTIME_GLOBAL', () => {
  it('names the global that site checks and the runtime share', () => {
    let runtime = installMutantRuntime()

    expect(RUNTIME_GLOBAL).toBe('__mootant')
    expect(Reflect.get(globalThis, RUNTIME_GLOBAL)).toBe(runtime)
    expect(getSiteSyntax(false).runtime).toBe(`globalThis.${RUNTIME_GLOBAL}`)

    Reflect.deleteProperty(globalThis, RUNTIME_GLOBAL)
  })
})
