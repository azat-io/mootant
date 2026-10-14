import { describe, expect, it } from 'vitest'

import { getParserOptions } from '../../../core/parser/get-parser-options'

describe('getParserOptions', () => {
  it.each([
    ['src/a.ts', 'ts', 'unambiguous'],
    ['src/a.mts', 'ts', 'module'],
    ['src/a.cts', 'ts', 'commonjs'],
    ['src/a.tsx', 'tsx', 'unambiguous'],
    ['src/a.js', 'jsx', 'unambiguous'],
    ['src/a.jsx', 'jsx', 'unambiguous'],
    ['src/a.mjs', 'jsx', 'module'],
    ['src/a.cjs', 'jsx', 'commonjs'],
    ['src/A.TS', 'ts', 'unambiguous'],
    ['src/A.MJS', 'jsx', 'module'],
    ['src/Component.TSX', 'tsx', 'unambiguous'],
    [String.raw`C:\project\a.cts`, 'ts', 'commonjs'],
  ])('derives the options of %s', (file, lang, sourceType) => {
    expect(getParserOptions(file)).toStrictEqual({ sourceType, lang })
  })

  it.each([
    'types/a.d.ts',
    'types/a.d.mts',
    'types/a.d.cts',
    'styles/a.d.css.ts',
    'types/A.D.TS',
  ])('returns null for the declaration file %s', file => {
    expect(getParserOptions(file)).toBeNull()
  })

  it.each([
    'package.json',
    'src/App.vue',
    'bin/mootant',
    'dist/a.js.map',
    // spell-checker: disable-next-line
    'src/a.mtsx',
    'src/a.ts.bak',
  ])('returns null for the unsupported file %s', file => {
    expect(getParserOptions(file)).toBeNull()
  })

  it('returns a new object for every call', () => {
    let options = getParserOptions('a.ts')!
    options.lang = 'js'

    expect(getParserOptions('a.ts')).toStrictEqual({
      sourceType: 'unambiguous',
      lang: 'ts',
    })
  })
})
