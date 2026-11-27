import { expect, inject, it } from 'vitest'

import { page } from '../../src/url'

it('adds the page to the URL of the server', () => {
  let url = inject('apiUrl' as never) as string
  expect(page(url, 2)).toBe(`${url}&page=2`)
  expect(page(url, 1)).toBe(url)
})
