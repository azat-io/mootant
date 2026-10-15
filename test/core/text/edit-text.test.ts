import type {
  AssignmentExpression,
  ExpressionStatement,
  Node,
} from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { ParsedFile } from '../../../types/source/parsed-file'
import type { TextEdit } from '../../../types/source/text-edit'

import { createTestFile } from '../../helpers/create-test-file'
import { editText } from '../../../core/text/edit-text'

/**
 * Edits applied to the first statement of a snippet, and the text they give.
 */
interface EditExample {
  /**
   * What the example shows.
   */
  description: string

  /**
   * Edits applied to the statement.
   */
  edits: TextEdit[]

  /**
   * Text of the statement after the edits.
   */
  expected: string

  /**
   * Code of the snippet.
   */
  source: string
}

/**
 * Reads the first statement of a file.
 *
 * @param parsed - Parsed file with at least one statement.
 * @returns The first statement.
 */
function getStatement(parsed: ParsedFile): Node {
  return parsed.program.body[0]!
}

describe('editText', () => {
  it.each<EditExample>([
    {
      edits: [{ text: 'toUpperCase', start: 2, end: 13 }],
      description: 'replaces a name',
      expected: 'a.toUpperCase()',
      source: 'a.toLowerCase()',
    },
    {
      edits: [{ text: 'false', start: 5, end: 5 }],
      description: 'inserts a text',
      expected: 'for(;false;) {}',
      source: 'for(;;) {}',
    },
    {
      edits: [{ start: 1, text: '', end: 3 }],
      description: 'deletes a text',
      source: 'a?.();',
      expected: 'a();',
    },
    {
      edits: [
        { text: 'z', start: 4, end: 5 },
        { text: 'x', start: 0, end: 1 },
      ],
      description: 'applies edits in the order of their offsets',
      expected: 'x.b.z;',
      source: 'a.b.c;',
    },
    {
      edits: [
        { text: 'c.', start: 2, end: 2 },
        { text: 'd', start: 2, end: 3 },
      ],
      description: 'applies an insertion and a replacement at one offset',
      expected: 'a.c.d;',
      source: 'a.b;',
    },
    {
      description: 'separates an edit from the text before it',
      edits: [{ text: 'y', start: 6, end: 9 }],
      expected: 'typeof y;',
      source: 'typeof(x);',
    },
    {
      description: 'separates an edit from the text after it',
      edits: [{ text: 'a', start: 0, end: 3 }],
      expected: 'a in b;',
      source: '(a)in b;',
    },
    {
      edits: [
        { start: 2, text: '', end: 3 },
        { start: 5, text: '', end: 6 },
      ],
      description: 'separates the texts around a deletion',
      expected: 'a- -b;',
      source: 'a-(-b);',
    },
    {
      description: 'separates a digit from a dot',
      edits: [{ text: '.', start: 1, end: 3 }],
      expected: '1 .x;',
      source: '1?.x;',
    },
    {
      description: 'keeps the text without edits',
      expected: 'a + b;',
      source: 'a + b;',
      edits: [],
    },
  ])('$description', ({ expected, source, edits }) => {
    let { parsed } = createTestFile(source)

    expect(editText(parsed, getStatement(parsed), edits)).toBe(expected)
  })

  it.each([
    [
      'overlapping edits',
      [
        { start: 4, text: '', end: 6 },
        { start: 5, text: '', end: 7 },
      ],
    ],
    ['an edit before the node', [{ start: 3, text: '', end: 5 }]],
    ['an edit after the node', [{ start: 8, text: '', end: 10 }]],
    ['an edit that ends before it starts', [{ start: 6, text: '', end: 5 }]],
  ])('rejects %s', (_description, edits: TextEdit[]) => {
    let { parsed } = createTestFile('x = a + b;')
    let statement = getStatement(parsed) as ExpressionStatement
    let assignment = statement.expression as AssignmentExpression

    expect(() => editText(parsed, assignment.right, edits)).toThrow(
      new RangeError('Edits must lie inside the node and must not overlap.'),
    )
  })
})
