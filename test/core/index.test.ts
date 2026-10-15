import { describe, expect, it } from 'vitest'

import { resolveSwitchedText } from '../../core/instrument/resolve-switched-text'
import { defineConfig } from '../../core/config/define-config'
import { classifyTry } from '../../core/run/classify-try'
import * as entry from '../../core/index'

describe('package entry', () => {
  it('exports defineConfig and the helpers of test runner adapters', () => {
    expect({ ...entry }).toStrictEqual({
      resolveSwitchedText,
      defineConfig,
      classifyTry,
    })
  })
})
