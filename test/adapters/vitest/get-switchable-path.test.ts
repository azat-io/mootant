import { describe, expect, it } from 'vitest'

import { getSwitchablePath } from '../../../adapters/vitest/get-switchable-path'

describe('getSwitchablePath', () => {
  it('keeps an id without a query', () => {
    expect(getSwitchablePath('/project/src/a.vue')).toBe('/project/src/a.vue')
  })

  it('reads the path of the external script of a Vue component', () => {
    expect(
      getSwitchablePath('/project/src/a.ts?vue&type=script&src=true&lang.ts'),
    ).toBe('/project/src/a.ts')
  })

  it.each([
    '\0virtual',
    '/project/src/a.ts?raw',
    '/project/src/a.vue?vue&type=script&setup=true&lang.ts',
    '/project/src/a.vue?vue&type=style&index=0&src=true&lang.css',
    '/project/src/a.ts?type=script&src=true',
  ])('rejects %s', id => {
    expect(getSwitchablePath(id)).toBeNull()
  })
})
