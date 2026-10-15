import { describe, expect, it } from 'vitest'

import { defineConfig } from '../../../core/config/define-config'

describe('defineConfig', () => {
  it('returns the configuration unchanged', () => {
    let config = { mutators: { 'string-literal': 'off' as const } }

    expect(defineConfig(config)).toBe(config)
  })
})
