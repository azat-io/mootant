import type { ExpressionStatement, Expression } from 'oxc-parser'

import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'

import { findTsconfigProperty } from '../../../adapters/shared/find-tsconfig-property'

/**
 * Parses the text of an expression.
 *
 * @param text - Text of the expression.
 * @returns Node of the expression.
 */
function parse(text: string): Expression {
  let { program } = parseSync('tsconfig.js', `(${text})`, {
    preserveParens: false,
  })
  let [statement] = program.body as [ExpressionStatement]
  return statement.expression
}

describe('findTsconfigProperty', () => {
  it('finds the last property of a name given by a string or an identifier', () => {
    let object = parse(
      '{ path: "./a.json", "other": 1, "path": "./b.json", other: 2 }',
    )

    expect(findTsconfigProperty(object, 'path')).toMatchObject({
      value: './b.json',
      type: 'Literal',
    })
    expect(findTsconfigProperty(object, 'other')).toMatchObject({
      type: 'Literal',
      value: 2,
    })
  })

  it('leaves out computed keys and spread elements', () => {
    let object = parse(
      '{ ["path"]: "./a.json", ...{ path: "./b.json" }, [path]: 1 }',
    )

    expect(findTsconfigProperty(object, 'path')).toBeNull()
  })

  it('gives null for a node that is no object or an object without the property', () => {
    expect(findTsconfigProperty(parse('{ "files": [] }'), 'path')).toBeNull()
    expect(findTsconfigProperty(parse('["path"]'), 'path')).toBeNull()
    expect(findTsconfigProperty(parse('"path"'), 'path')).toBeNull()
    expect(findTsconfigProperty(null, 'path')).toBeNull()
  })
})
