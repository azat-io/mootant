import { describe, expect, it } from 'vitest'

import { isSourceFile } from '../../../core/files/is-source-file'

describe('isSourceFile', () => {
  it.each([
    ['src/a.ts', true],
    ['src/a.cjs', true],
    ['src/App.vue', true],
    ['src/Card.svelte', true],
    ['src/index.astro', true],
    ['src/a.d.ts', false],
    ['src/readme.md', false],
    ['src/a.css', false],
  ])('tells that %s is listed: %s', (file, expected) => {
    expect(isSourceFile(file)).toBe(expected)
  })
})
