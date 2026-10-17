import { expect, inject, it } from 'vitest'

import { label } from '../src/config'

declare const __MOOTANT_DEFINE__: string

it('labels the defined and provided values', () => {
  expect(label(__MOOTANT_DEFINE__)).toBe(
    __MOOTANT_DEFINE__ === '' ? 'empty' : `[${__MOOTANT_DEFINE__}]`,
  )
  let flag = inject('flag' as never) as string
  expect(label(flag)).toBe(flag === '' ? 'empty' : `[${flag}]`)
})
