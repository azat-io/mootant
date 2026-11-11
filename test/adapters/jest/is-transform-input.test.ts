import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { isTransformInput } from '../../../adapters/jest/is-transform-input'

/* Cspell:words babelignore browserslistrc swcrc */

describe('isTransformInput', () => {
  it('takes a file or a directory that exists, whatever its name', () => {
    expect(isTransformInput(import.meta.filename)).toBe(true)
    expect(isTransformInput(import.meta.dirname)).toBe(true)
  })

  it.each([
    '.babelrc',
    '.babelrc.js',
    'babel.config.json',
    '.babelignore',
    '.swcrc',
    '.browserslistrc',
    'browserslist',
    'tsconfig.json',
    'tsconfig.test.json',
  ])('takes a missing %s, as creating it changes the code', name => {
    expect(isTransformInput(path.join('/missing/sub', name))).toBe(true)
  })

  it.each(['src.ts', 'src.d.ts', 'package.json', 'index.tsx'])(
    'leaves out a missing %s, a probe that depends on what a cache held',
    name => {
      expect(isTransformInput(path.join('/missing/sub', name))).toBe(false)
    },
  )
})
