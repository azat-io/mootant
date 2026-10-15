import { describe, expect, it } from 'vitest'

import { defineConfig } from '../../core/config/define-config'
import * as entry from '../../core/index'

describe('package entry', () => {
  it('exports defineConfig', () => {
    expect({ ...entry }).toStrictEqual({ defineConfig })
  })
})
