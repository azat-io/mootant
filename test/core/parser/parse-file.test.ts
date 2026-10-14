import { describe, expect, it, vi } from 'vitest'
import { parseSync } from 'oxc-parser'

import { parseFile } from '../../../core/parser/parse-file'

/**
 * Byte order mark that may start a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

vi.mock(import('oxc-parser'), async importOriginal => {
  let original = await importOriginal()
  return { ...original, parseSync: vi.fn(original.parseSync) }
})

describe('parseFile', () => {
  it('parses a TypeScript file', () => {
    let source = ['export let total: number = 1', 'total += 2'].join('\n')

    let outcome = parseFile('src/a.ts', source)

    expect(outcome).toMatchObject({
      parsed: {
        program: { type: 'Program' },
        language: 'typescript',
        sourceType: 'module',
        lineStarts: [0, 29],
        file: 'src/a.ts',
        text: source,
      },
      kind: 'parsed',
    })
  })

  it.each([
    {
      source: 'let a = <div />',
      language: 'typescript',
      sourceType: 'script',
      file: 'src/a.tsx',
    },
    {
      source: 'let a = <div />',
      language: 'javascript',
      sourceType: 'script',
      file: 'src/a.js',
    },
    {
      language: 'javascript',
      sourceType: 'module',
      source: 'let a = 1',
      file: 'src/a.mjs',
    },
    {
      sourceType: 'commonjs',
      language: 'javascript',
      source: 'return 1',
      file: 'src/a.cjs',
    },
    {
      language: 'typescript',
      sourceType: 'commonjs',
      source: 'export = 1',
      file: 'src/a.cts',
    },
    {
      source: 'import a from "a"',
      language: 'javascript',
      sourceType: 'module',
      file: 'src/a.jsx',
    },
  ])(
    'parses $file with the language and module system of its extension',
    ({ sourceType, language, source, file }) => {
      expect(parseFile(file, source)).toMatchObject({
        parsed: { sourceType, language },
        kind: 'parsed',
      })
    },
  )

  it.each([
    { source: 'if (a) return\nmodule.exports = 1', file: 'lib/a.js' },
    { source: 'if (a) return\nlet b = <div />', file: 'lib/a.jsx' },
  ])('parses $file with a top-level return as CommonJS', ({ source, file }) => {
    expect(parseFile(file, source)).toMatchObject({
      parsed: {
        program: { body: [{ type: 'IfStatement' }, {}] },
        language: 'javascript',
        sourceType: 'commonjs',
      },
      kind: 'parsed',
    })
  })

  it.each([
    { source: 'import a from "a"\nreturn a', file: 'lib/a.js' },
    { source: 'return\nexport {}', file: 'lib/a.jsx' },
    { source: 'return import.meta', file: 'lib/a.js' },
    { source: 'return 1', file: 'lib/a.mjs' },
    { source: 'return 1', file: 'lib/a.ts' },
  ])(
    'reports a top-level return in $file that cannot be CommonJS',
    ({ source, file }) => {
      expect(parseFile(file, source)).toMatchObject({
        diagnostics: [
          {
            message:
              "A 'return' statement can only be used within a function body.",
          },
        ],
        kind: 'failed',
      })
    },
  )

  it('parses a block with the given settings and accepts a top-level return', () => {
    let source = [
      'function f() {}',
      'if (a) return 1',
      'let b = await c',
      'let g = () => { return 2 }',
    ].join('\n')

    expect(
      parseFile('src/index.astro', source, {
        options: { sourceType: 'module', lang: 'ts' },
        length: source.length,
        topLevelReturn: true,
      }),
    ).toMatchObject({
      parsed: {
        file: 'src/index.astro',
        language: 'typescript',
        sourceType: 'module',
        text: source,
      },
      kind: 'parsed',
    })
  })

  it.each([
    {
      message:
        "A 'return' statement cannot be used inside a class static block.",
      source: 'class A { static { return } }',
    },
    {
      message: 'Logical expressions and coalesce expressions cannot be mixed',
      source: 'return 1\na ?? b || c',
    },
  ])(
    'reports other errors of a block that accepts a top-level return',
    ({ message, source }) => {
      expect(
        parseFile('src/index.astro', source, {
          options: { sourceType: 'module', lang: 'ts' },
          length: source.length,
          topLevelReturn: true,
        }),
      ).toMatchObject({ diagnostics: [{ message }], kind: 'failed' })
    },
  )

  it('keeps an error without a label of a block that accepts a top-level return', () => {
    let result = parseSync('a.ts', 'return 1')
    let [error] = result.errors
    vi.mocked(parseSync).mockReturnValueOnce({
      errors: [{ ...error!, labels: [] }],
      comments: result.comments,
      program: result.program,
      module: result.module,
    })

    expect(
      parseFile('src/index.astro', 'return 1', {
        options: { sourceType: 'module', lang: 'ts' },
        topLevelReturn: true,
        length: 8,
      }),
    ).toMatchObject({ diagnostics: [{ column: null, line: null }] })
  })

  it('parses JavaScript of a block without JSX', () => {
    expect(
      parseFile('src/App.vue', 'let a = <div />', {
        options: { sourceType: 'module', lang: 'js' },
        topLevelReturn: false,
        length: 15,
      }),
    ).toMatchObject({ kind: 'failed' })
  })

  it('parses only the given length and keeps the whole text', () => {
    let source = 'let a = (\n\n  '

    expect(
      parseFile('src/App.vue', source, {
        options: { sourceType: 'module', lang: 'js' },
        topLevelReturn: false,
        length: 9,
      }),
    ).toMatchObject({ diagnostics: [{ column: 10, line: 1 }], kind: 'failed' })
    expect(
      parseFile('src/App.vue', 'let a = 1\n\n  ', {
        options: { sourceType: 'module', lang: 'js' },
        topLevelReturn: false,
        length: 9,
      }),
    ).toMatchObject({
      parsed: { text: 'let a = 1\n\n  ', lineStarts: [0, 10, 11] },
    })
  })

  it('reports the errors of the first parse when CommonJS fails too', () => {
    let outcome = parseFile('lib/a.js', 'return 1\nlet a = (1')

    expect(outcome).toMatchObject({
      diagnostics: [
        {
          message:
            "A 'return' statement can only be used within a function body.",
          line: 1,
        },
        { message: 'Expected `)` but found `EOF`', line: 2 },
      ],
      kind: 'failed',
    })
  })

  it('keeps parenthesized expressions in the tree', () => {
    let outcome = parseFile('a.ts', '((a))')

    expect(outcome).toMatchObject({
      parsed: {
        program: {
          body: [
            {
              expression: {
                expression: {
                  expression: { type: 'Identifier' },
                  type: 'ParenthesizedExpression',
                },
                type: 'ParenthesizedExpression',
              },
            },
          ],
        },
      },
    })
  })

  it('collects the comments and their end offsets', () => {
    let outcome = parseFile('a.js', 'a /* x */ + b // y')

    expect(outcome).toMatchObject({
      parsed: {
        comments: [
          { type: 'Block', value: ' x ', start: 2, end: 9 },
          { type: 'Line', value: ' y', start: 14, end: 18 },
        ],
        commentEnds: new Map([
          [14, 18],
          [2, 9],
        ]),
      },
    })
  })

  it.each([
    {
      source: '#!/usr/bin/env node\nlet a = 1',
      statementStart: 20,
      description: 'LF',
      file: 'a.js',
    },
    {
      source: '#!/usr/bin/env node\r\nlet a = 1',
      description: 'CRLF',
      statementStart: 21,
      file: 'a.js',
    },
    {
      source: '#!/usr/bin/env node\u{2028}let a = 1',
      description: 'U+2028',
      statementStart: 20,
      file: 'a.ts',
    },
    {
      source: `${BYTE_ORDER_MARK}#!/usr/bin/env node\nlet a = 1`,
      description: 'LF after a byte order mark',
      statementStart: 21,
      file: 'a.ts',
    },
  ])(
    'blanks a hashbang line ended by $description and keeps every offset',
    ({ statementStart, source, file }) => {
      let outcome = parseFile(file, source)

      expect(outcome).toMatchObject({
        parsed: {
          program: { body: [{ start: statementStart }] },
          comments: [],
          text: source,
        },
        kind: 'parsed',
      })
    },
  )

  it('blanks a hashbang that ends the file', () => {
    let outcome = parseFile('bin/a.js', '#!/usr/bin/env node')

    expect(outcome).toMatchObject({
      parsed: { program: { body: [] }, comments: [] },
      kind: 'parsed',
    })
  })

  it('keeps a byte order mark without a hashbang', () => {
    let source = `${BYTE_ORDER_MARK}let a = 1`

    let outcome = parseFile('a.ts', source)

    expect(outcome).toMatchObject({
      parsed: {
        program: { body: [{ start: 1 }] },
        lineStarts: [1],
        text: source,
      },
      kind: 'parsed',
    })
  })

  it('reports a fatal error with its position', () => {
    let outcome = parseFile('src/a.ts', ['let a = 1', 'let b = (1'].join('\n'))

    expect(outcome).toStrictEqual({
      diagnostics: [
        {
          message: 'Expected `)` but found `EOF`',
          code: 'parse-error',
          severity: 'error',
          file: 'src/a.ts',
          column: 11,
          line: 2,
        },
      ],
      kind: 'failed',
    })
  })

  it('reports a recoverable error', () => {
    let outcome = parseFile('src/a.js', 'a ?? b || c')

    expect(outcome).toStrictEqual({
      diagnostics: [
        {
          message:
            'Logical expressions and coalesce expressions cannot be mixed',
          code: 'parse-error',
          severity: 'error',
          file: 'src/a.js',
          column: 1,
          line: 1,
        },
      ],
      kind: 'failed',
    })
  })

  it('reports a hashbang that does not start the file', () => {
    let outcome = parseFile('src/a.js', 'x\n#!y')

    expect(outcome).toMatchObject({
      diagnostics: [{ column: 2, line: 2 }],
      kind: 'failed',
    })
  })

  it('reports an error without a label without a position', () => {
    let result = parseSync('a.ts', 'let a = (1')
    let [error] = result.errors
    vi.mocked(parseSync).mockReturnValueOnce({
      errors: [{ ...error!, labels: [] }],
      comments: result.comments,
      program: result.program,
      module: result.module,
    })

    expect(parseFile('src/a.ts', 'let a = (1')).toStrictEqual({
      diagnostics: [
        {
          message: 'Expected `)` but found `EOF`',
          code: 'parse-error',
          severity: 'error',
          file: 'src/a.ts',
          column: null,
          line: null,
        },
      ],
      kind: 'failed',
    })
  })

  it('passes the parser options of the extension', () => {
    parseFile('src/a.mts', 'let a = 1')

    expect(parseSync).toHaveBeenLastCalledWith('src/a.mts', 'let a = 1', {
      preserveParens: true,
      sourceType: 'module',
      lang: 'ts',
    })
  })
})
