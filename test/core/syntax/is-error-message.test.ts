import { describe, expect, it } from 'vitest'

import { isErrorMessage } from '../../../core/syntax/is-error-message'
import { createTestFile } from '../../helpers/create-test-file'

describe('isErrorMessage', () => {
  it.each([
    "new Error('x')",
    "Error('x')",
    "new HttpError(404, 'x')",
    "new errors.ValidationError('x')",
    "new (TypeError as any)('x')",
    "new HTTPError('x')",
    "throw new Error(format('x', id))",
    "throw new Error(['x'].join(' '))",
    "let error = new RangeError('x')",
    "new Error(...['x'])",
    "assert(ok, 'x')",
    "assert.ok(ok, 'x')",
    "invariant(ok, 'x')",
    "throw 'x'",
    "throw ('x' as string)",
    "throw 'x' + id",
    "throw id + ('x' + more)",
    "if (bad) throw 'x'",
  ])('accepts the text in %s', source => {
    let { find, tree } = createTestFile(source)

    expect(isErrorMessage(tree, find('Literal', "'x'"))).toBe(true)
  })

  it.each([
    "let message = 'x'",
    "f('x')",
    "new a.b('x')",
    "new errors['Error']('x')",
    "assert('x', ok)",
    "assert(ok, other, 'x')",
    "new assert(ok, 'x')",
    "check(ok, 'x')",
    "f()(ok, 'x')",
    "throw f('x')",
    "throw id - 'x'",
    "throw new Error(() => 'x')",
    "new Error(callback(function () { return 'x' }))",
    "x = { key: 'x' }",
    "form.setError('x', { type: 'manual' })",
    "form.setError('email', { type: 'x' })",
    "setHasError('x')",
    "isError(value, 'x')",
    "createError('x')",
    "onError('x')",
    "new error('x')",
  ])('rejects the text in %s', source => {
    let { find, tree } = createTestFile(source)

    expect(isErrorMessage(tree, find('Literal', "'x'"))).toBe(false)
  })

  it('accepts the identifier of a thrown sum', () => {
    let { find, tree } = createTestFile("throw 'bad ' + id")

    expect(isErrorMessage(tree, find('Identifier', 'id'))).toBe(true)
  })

  it('returns false for the program', () => {
    let { find, tree } = createTestFile("throw 'x'")

    expect(isErrorMessage(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile("throw 'x'")
    let other = createTestFile("throw 'x'")

    expect(() => isErrorMessage(tree, other.find('Literal'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
