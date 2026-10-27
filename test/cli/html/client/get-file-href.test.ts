import { describe, expect, it } from 'vitest'

import { getFileHref } from '../../../../cli/html/client/get-file-href'
import { parseRoute } from '../../../../cli/html/client/parse-route'

describe('getFileHref', () => {
  it('escapes each part of the path and adds the line', () => {
    expect(getFileHref('src/cart.ts')).toBe('#/file/src/cart.ts')
    expect(getFileHref('src/a b#c:5.ts', 12)).toBe(
      '#/file/src/a%20b%23c%3A5.ts:12',
    )
  })

  it('makes a hash the route reads back', () => {
    expect(parseRoute(getFileHref('a:5', 7))).toStrictEqual({
      name: 'files',
      path: 'a:5',
      line: 7,
    })
  })
})
