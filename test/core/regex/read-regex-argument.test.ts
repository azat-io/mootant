import { describe, expect, it, vi } from 'vitest'

import type { RegexSource } from '../../../types/regex/regex-source'

import { readRegexArgument } from '../../../core/regex/read-regex-argument'
import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'
import { mapStringUnits } from '../../../core/regex/map-string-units'
import { readRegexCall } from '../../../core/regex/read-regex-call'
import { createTestFile } from '../../helpers/create-test-file'

vi.mock(
  import('../../../core/regex/parse-regex-pattern'),
  async importOriginal => {
    let actual = await importOriginal()
    return { parseRegexPattern: vi.fn(actual.parseRegexPattern) }
  },
)

vi.mock(
  import('../../../core/regex/map-string-units'),
  async importOriginal => {
    let actual = await importOriginal()
    return { mapStringUnits: vi.fn(actual.mapStringUnits) }
  },
)

/**
 * Reads the pattern argument of the `RegExp` call of `x = RegExp(...)`.
 *
 * @param parts - Text of the arguments.
 * @param name - Name of the file, which picks the language.
 * @returns The regular expression as read, or null.
 */
function read(parts: string, name?: string): RegexSource | null {
  let file = createTestFile(`x = RegExp(${parts})`, name)
  return readRegexArgument(
    readRegexCall(file.find('CallExpression'), file)!,
    file.sourceCode.text,
  )
}

describe('readRegexArgument', () => {
  it('reads a string pattern with its escapes', () => {
    let file = createTestFile(String.raw`x = RegExp('\\d\x41', 'g')`)
    let call = file.find('CallExpression')

    expect(
      readRegexArgument(readRegexCall(call, file)!, file.sourceCode.text),
    ).toMatchObject({
      flagsNode: file.find('Literal', "'g'"),
      node: file.find('Literal'),
      offsets: [12, 14, 15, 19],
      tree: { type: 'Pattern' },
      pattern: String.raw`\dA`,
      expression: call,
      dynamic: false,
      form: 'string',
      flags: 'g',
    })
  })

  it('reads a template without expressions', () => {
    expect(read(String.raw`${'`'}a\\.${'`'}`)).toMatchObject({
      offsets: [12, 13, 15, 16],
      pattern: String.raw`a\.`,
      form: 'template',
      dynamic: false,
    })
  })

  it('reads a String.raw template as it is written', () => {
    expect(read(String.raw`String.raw${'`'}\d+${'`'}`)).toMatchObject({
      offsets: [22, 23, 24, 25],
      pattern: String.raw`\d+`,
      dynamic: false,
      form: 'raw',
    })
  })

  it('reads a template with expressions with a group in their place', () => {
    expect(read(`\`^\${a}-\${b}$\`, "m"`)).toMatchObject({
      offsets: [12, 13, 13, 13, 13, 17, 18, 18, 18, 18, 22, 23],
      pattern: '^(?:)-(?:)$',
      form: 'template',
      dynamic: true,
      flags: 'm',
    })
  })

  it.each(['example.js', 'example.jsx'])(
    'reads templates of %s, whose parts are only their text',
    name => {
      expect(read(`\`^\${a}-\${b}$\`, "m"`, name)).toMatchObject({
        offsets: [12, 13, 13, 13, 13, 17, 18, 18, 18, 18, 22, 23],
        pattern: '^(?:)-(?:)$',
        dynamic: true,
      })
      expect(read(String.raw`${'`'}a\\.${'`'}`, name)).toMatchObject({
        offsets: [12, 13, 15, 16],
        pattern: String.raw`a\.`,
      })
      expect(read(String.raw`String.raw${'`'}\d+${'`'}`, name)).toMatchObject({
        offsets: [22, 23, 24, 25],
        pattern: String.raw`\d+`,
      })
    },
  )

  it.each(["'('", "'a', 'gg'", String.raw`'\\p{Foo}', 'u'`])(
    'skips %s, which does not compile',
    parts => {
      expect(read(parts)).toBeNull()
    },
  )

  it('reads a template with a carriage return as a line feed', () => {
    expect(read('`a\r\nb`')).toMatchObject({
      offsets: [12, 13, 15, 16],
      pattern: 'a\nb',
    })
  })

  it('skips a String.raw template with a carriage return', () => {
    expect(read('String.raw`a\r\nb`')).toBeNull()
  })

  it.each(["'a'", '`a`'])(
    'skips %s when the value read differs from the parsed one',
    parts => {
      vi.mocked(mapStringUnits).mockReturnValueOnce({
        offsets: [12, 13],
        value: 'b',
      })

      expect(read(parts)).toBeNull()
    },
  )

  it('skips a pattern regexpp cannot parse', () => {
    vi.mocked(parseRegexPattern).mockReturnValueOnce(null)

    expect(read("'a'")).toBeNull()
  })
})
