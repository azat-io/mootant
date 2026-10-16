import type { Node } from 'oxc-parser'

import { describe, expect, it, vi } from 'vitest'
import { parseSync } from 'oxc-parser'

import type { TemplateExpression } from '../../../types/source/template-expression'

import { parseTemplateExpressions } from '../../../core/parser/parse-template-expressions'
import { walkTree } from '../../../core/tree/walk-tree'

vi.mock(import('oxc-parser'), async importOriginal => {
  let original = await importOriginal()
  return { ...original, parseSync: vi.fn(original.parseSync) }
})

/**
 * Byte order mark that may start a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

/**
 * Finds the template code of a text: every run between `{` and `}` that starts
 * with a marker, `?` for a condition, `=` for a declaration, `!` for a handler,
 * `@` for a Vue event handler and `:` for a value.
 *
 * @param source - Text with markers.
 * @returns Template code in source order.
 */
function findExpressions(source: string): TemplateExpression[] {
  let wraps = {
    '=': 'declaration',
    '?': 'condition',
    '!': 'handler',
    '@': 'event',
    ':': 'value',
  } as const
  return [...source.matchAll(/\{(?<marker>[!:=?@])(?<code>[^}]*)\}/gu)].map(
    match => {
      let start = match.index + 2
      return {
        wrap: wraps[match.groups!['marker'] as keyof typeof wraps],
        end: start + match.groups!['code']!.length,
        start,
      }
    },
  )
}

/**
 * Lists the nodes of a program with their text.
 *
 * @param program - Root of the program.
 * @param text - Text the offsets index into.
 * @param hosts - Nodes only the synthetic module has.
 * @returns Type, text and whether each node is a host, in tree order.
 */
function describeNodes(
  program: Node,
  text: string,
  hosts: ReadonlySet<Node>,
): string[] {
  let nodes: string[] = []
  walkTree(program, node => {
    let host = hosts.has(node) ? ' (host)' : ''
    nodes.push(`${node.type} ${text.slice(node.start, node.end)}${host}`)
    return true
  })
  return nodes
}

/**
 * Narrows an outcome to a parsed program.
 *
 * @param outcome - Outcome of a parse.
 * @returns The outcome of a program that parsed.
 * @throws Error - When the expressions did not parse.
 */
function getParsed(
  outcome: ReturnType<typeof parseTemplateExpressions>,
): Extract<ReturnType<typeof parseTemplateExpressions>, { kind: 'parsed' }> {
  if (outcome.kind !== 'parsed') {
    throw new Error(outcome.message)
  }
  return outcome
}

describe('parseTemplateExpressions', () => {
  it('moves the nodes of every kind of code to the offsets of the file', () => {
    let source = '<p>{?a > 1}</p>\n<i>{:b}</i>{=const c = 2}'
    let outcome = parseTemplateExpressions(
      { file: 'a.svelte', lang: 'js', source },
      findExpressions(source),
    )
    let { parsed, hosts } = getParsed(outcome)

    expect(parsed.text).toBe('     a > 1     \n     b       const c = 2 ')
    expect(parsed.lineStarts).toStrictEqual([0, 16])
    expect(parsed).toMatchObject({
      language: 'javascript',
      sourceType: 'module',
      file: 'a.svelte',
    })
    expect(describeNodes(parsed.program, parsed.text, hosts)).toStrictEqual([
      'Program a > 1     \n     b       const c = 2 (host)',
      'IfStatement a > 1 (host)',
      'BinaryExpression a > 1',
      'Identifier a',
      'Literal 1',
      'EmptyStatement  (host)',
      'ExpressionStatement b (host)',
      'ArrayExpression b (host)',
      'ParenthesizedExpression b (host)',
      'Identifier b',
      'BlockStatement const c = 2 (host)',
      'VariableDeclaration const c = 2',
      'VariableDeclarator c = 2',
      'Identifier c',
      'Literal 2',
    ])
  })

  it('parses TypeScript and moves comments', () => {
    let source = `${BYTE_ORDER_MARK}{:/* x */ (v as number) + 1}`
    let outcome = parseTemplateExpressions(
      { file: 'a.svelte', lang: 'ts', source },
      findExpressions(source),
    )
    let { parsed } = getParsed(outcome)

    expect(parsed.language).toBe('typescript')
    expect(parsed.text.startsWith(`${BYTE_ORDER_MARK}  /* x */`)).toBe(true)
    expect(parsed.comments).toMatchObject([
      { type: 'Block', value: ' x ', start: 3, end: 10 },
    ])
    expect(parsed.commentEnds).toStrictEqual(new Map([[3, 10]]))
  })

  it('marks the arrow functions with an expression body of handlers', () => {
    let source = '{!() => a++}{!(() => b)}{!f}{:() => c}{!() => [d]}'
    let expressions = findExpressions(source)
    let outcome = parseTemplateExpressions(
      { file: 'a.svelte', lang: 'js', source },
      expressions,
    )
    let { handlers, parsed } = getParsed(outcome)

    expect(
      [...handlers].map(node => parsed.text.slice(node.start, node.end)),
    ).toStrictEqual(['() => a++', '() => b', '() => [d]'])

    let block = '{() => { e++ }}'
    let blockOutcome = parseTemplateExpressions(
      { file: 'a.svelte', source: block, lang: 'js' },
      [{ end: block.length - 1, wrap: 'handler', start: 1 }],
    )

    expect(getParsed(blockOutcome).handlers.size).toBe(0)
  })

  it('keeps the form Vue compiles an event handler by', () => {
    let handlerTexts = [
      'onSave',
      'form[key]',
      'a?.b',
      'undefined',
      'a++',
      'go(1); a--',
      '(() => a + 1)!',
      ' function () { go(2) }',
      'async () => {}',
      ' /* c */ ',
    ]
    let source = handlerTexts.join('|')
    let expressions: TemplateExpression[] = []
    for (let text of handlerTexts) {
      let start = expressions.length === 0 ? 0 : expressions.at(-1)!.end + 1
      expressions.push({ end: start + text.length, wrap: 'event', start })
    }
    let outcome = parseTemplateExpressions(
      { file: 'a.vue', lang: 'ts', source },
      expressions,
    )
    let { handlers, parsed, hosts } = getParsed(outcome)
    let kept = describeNodes(parsed.program, parsed.text, hosts).filter(
      node =>
        node.endsWith('(host)') &&
        !/^(?:BlockStatement|ExpressionStatement|Program) /u.test(node),
    )

    expect(kept).toStrictEqual([
      'Identifier onSave (host)',
      'MemberExpression form[key] (host)',
      'Identifier form (host)',
      'Identifier key (host)',
      'ChainExpression a?.b (host)',
      'MemberExpression a?.b (host)',
      'Identifier a (host)',
      'Identifier b (host)',
      'TSNonNullExpression (() => a + 1)! (host)',
      'ParenthesizedExpression (() => a + 1) (host)',
      'ArrowFunctionExpression () => a + 1 (host)',
      'ParenthesizedExpression  function () { go(2) } (host)',
      'FunctionExpression function () { go(2) } (host)',
      'ArrowFunctionExpression async () => {} (host)',
    ])
    expect(
      [...handlers].map(node => parsed.text.slice(node.start, node.end)),
    ).toStrictEqual(['() => a + 1'])
  })

  it('reports code that does not parse as the one statement around it', () => {
    let source = '<p>{:a)]; [(b}</p>'

    expect(
      parseTemplateExpressions(
        { file: 'a.vue', lang: 'js', source },
        findExpressions(source),
      ),
    ).toStrictEqual({
      message: 'An expression does not parse on its own.',
      kind: 'failed',
      offset: 5,
    })
  })

  it('reports the first parse error at its offset in the file', () => {
    let source = '<p>{:a}</p>{:b +}'

    expect(
      parseTemplateExpressions(
        { file: 'a.svelte', lang: 'js', source },
        findExpressions(source),
      ),
    ).toStrictEqual({
      message: 'Unexpected token',
      kind: 'failed',
      offset: 16,
    })
  })
  it('reports an error without a label without an offset', () => {
    let result = parseSync('a.js', '[(b +)];')
    let [error] = result.errors
    vi.mocked(parseSync).mockReturnValueOnce({
      errors: [{ ...error!, labels: [] }],
      comments: result.comments,
      program: result.program,
      module: result.module,
    })
    let source = '{:b +}'

    expect(
      parseTemplateExpressions(
        { file: 'a.svelte', lang: 'js', source },
        findExpressions(source),
      ),
    ).toStrictEqual({
      message: 'Unexpected token',
      kind: 'failed',
      offset: null,
    })
  })
})
