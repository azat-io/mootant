import { describe, expect, it } from 'vitest'

import { getTemplateSiteCheck } from '../../../core/instrument/get-template-site-check'
import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { RUNTIME_SYMBOL_KEY } from '../../../core/runtime/runtime-symbol-key'

describe('rUNTIME_SYMBOL_KEY', () => {
  it('names the symbol that template checks and the runtime share', () => {
    let runtime = installMutantRuntime()

    expect(RUNTIME_SYMBOL_KEY).toBe('mootant')
    expect(Reflect.get(Math, Symbol.for(RUNTIME_SYMBOL_KEY))).toBe(runtime)
    expect(getTemplateSiteCheck('m1')).toContain(
      `Symbol.for(\`${RUNTIME_SYMBOL_KEY}\`)`,
    )

    Reflect.deleteProperty(globalThis, '__mootant')
    Reflect.deleteProperty(Math, Symbol.for(RUNTIME_SYMBOL_KEY))
  })
})
