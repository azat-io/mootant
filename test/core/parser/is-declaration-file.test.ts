import { describe, expect, it } from 'vitest'

import { isDeclarationFile } from '../../../core/parser/is-declaration-file'

describe('isDeclarationFile', () => {
  it.each([
    'types/a.d.ts',
    'types/a.d.mts',
    'types/a.d.cts',
    'styles/a.d.css.ts',
    'types/A.D.TS',
    String.raw`C:\types\a.d.ts`,
  ])('accepts %s', file => {
    expect(isDeclarationFile(file)).toBe(true)
  })

  it.each([
    'src/a.ts',
    'src/a.d.js',
    'src/d.ts',
    'src/a.dts',
    'src/a.d.tsx',
    'src/a.d.ts.bak',
  ])('rejects %s', file => {
    expect(isDeclarationFile(file)).toBe(false)
  })
})
