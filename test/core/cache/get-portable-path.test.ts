import { describe, expect, it } from 'vitest'

import { getPortablePath } from '../../../core/cache/get-portable-path'

describe('getPortablePath', () => {
  it('makes a path relative to the root', () => {
    expect(getPortablePath('/p/src/a.ts', '/p')).toBe('src/a.ts')
  })

  it('goes up out of the root for a path outside it', () => {
    expect(getPortablePath('/q/a.ts', '/p')).toBe('../q/a.ts')
  })

  it('turns a backslash in a name into a slash', () => {
    expect(getPortablePath(String.raw`/p/a\b.ts`, '/p')).toBe('a/b.ts')
  })
})
