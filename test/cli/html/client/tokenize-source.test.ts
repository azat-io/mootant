import { describe, expect, it } from 'vitest'

import { tokenizeSource } from '../../../../cli/html/client/tokenize-source'

/**
 * Splits a text into runs of the kinds `tokenizeSource` marks.
 *
 * @param source - Text to mark.
 * @returns Runs as `kind:text`.
 */
function runs(source: string): string[] {
  let kinds = tokenizeSource(source)
  let result: string[] = []
  let start = 0
  for (let index = 1; index <= source.length; index++) {
    if (index === source.length || kinds[index] !== kinds[start]) {
      result.push(`${kinds[start]}:${source.slice(start, index)}`)
      start = index
    }
  }
  return result
}

describe('tokenizeSource', () => {
  it('marks keywords, comments, strings and numbers', () => {
    expect(
      runs("// note\nlet value = 'a\\'b' + 1.5 /* c */ + `x\ny`"),
    ).toStrictEqual([
      '2:// note',
      '0:\n',
      '1:let',
      '0: value = ',
      String.raw`3:'a\'b'`,
      '0: + ',
      '4:1.5',
      '0: ',
      '2:/* c */',
      '0: + ',
      '3:`x\ny`',
    ])
  })

  it('leaves keywords that are properties and plain words alone', () => {
    expect(runs('task.return(item_1)')).toStrictEqual(['0:task.return(item_1)'])
  })

  it('tells regular expressions from divisions', () => {
    expect(
      runs(
        `${String.raw`let r = /'\/[/]/u.test(x) // c`}\nreturn /x/g, a / b / 2`,
      ),
    ).toStrictEqual([
      '1:let',
      '0: r = ',
      String.raw`3:/'\/[/]/u`,
      '0:.test(x) ',
      '2:// c',
      '0:\n',
      '1:return',
      '0: ',
      '3:/x/g',
      '0:, a / b / ',
      '4:2',
    ])
    expect(runs('x.in / 2 / 3')).toStrictEqual([
      '0:x.in / ',
      '4:2',
      '0: / ',
      '4:3',
    ])
    expect(runs('a = /x\ny/')).toStrictEqual(['0:a = /x\ny/'])
    expect(runs('= /x')).toStrictEqual(['0:= /x'])
    expect(runs('= /x/u')).toStrictEqual(['0:= ', '3:/x/u'])
  })

  it('ends a quoted string at the line end and open tokens at the text end', () => {
    expect(runs("'a\nb /* c")).toStrictEqual(["3:'a", '0:\nb ', '2:/* c'])
    expect(runs('"x')).toStrictEqual(['3:"x'])
    expect(runs("// a\rlet 'b\rc")).toStrictEqual([
      '2:// a',
      '0:\r',
      '1:let',
      '0: ',
      "3:'b",
      '0:\rc',
    ])
  })
})
