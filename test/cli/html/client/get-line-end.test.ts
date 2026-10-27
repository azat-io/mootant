import { describe, expect, it } from 'vitest'

import { getLineStarts } from '../../../../core/text/get-line-starts'
import { getLineEnd } from '../../../../cli/html/client/get-line-end'

describe('getLineEnd', () => {
  it('leaves out every line terminator', () => {
    let source = 'a\r\nbb\rc\u{2028}d\ne'
    let lineStarts = getLineStarts(source)

    expect(
      [1, 2, 3, 4, 5].map(line =>
        source.slice(
          lineStarts[line - 1],
          getLineEnd(source, lineStarts, line),
        ),
      ),
    ).toStrictEqual(['a', 'bb', 'c', 'd', 'e'])
  })
})
