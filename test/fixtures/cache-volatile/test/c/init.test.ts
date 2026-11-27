import { expect, it } from 'vitest'

import { host } from '../../src/code'

it('reads the host of the URL a define stored as it ran', () => {
  let url = Reflect.get(globalThis, 'mootantUrl') as string
  expect(host(url)).toBe('127.0.0.1')
  expect(host('ftp://example.com')).toBe('')
})
