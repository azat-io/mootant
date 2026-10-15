import { describe, expect, it } from 'vitest'

import * as runtime from '../../../core/runtime/index'

describe('mootant/runtime', () => {
  it('exports the runtime and its error helpers', () => {
    expect(Object.keys(runtime).toSorted()).toStrictEqual([
      'RUNTIME_GLOBAL',
      'createHitLimitError',
      'installMutantRuntime',
      'isHitLimitError',
    ])
    expect(runtime.RUNTIME_GLOBAL).toBe('__mootant')
  })
})
