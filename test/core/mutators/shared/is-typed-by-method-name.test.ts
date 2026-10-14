import { describe, expect, it } from 'vitest'

import { isTypedByMethodName } from '../../../../core/mutators/shared/is-typed-by-method-name'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isTypedByMethodName', () => {
  it.each<[string, boolean]>([
    ['x = await client.search(query)', true],
    ['x = await cache.has(key)', true],
    ['x = await tx.join()', true],
    ['x = await (client?.search(query))', true],
    ['x = await (client.search as any)(query)', true],
    ['let s: string = f(); x = await s.trim()', false],
    ['let list: number[] = f(); x = await list.includes(1)', false],
    ['x = await Array.isArray(y)', false],
    ['x = await Object.hasOwn(y, 1)', false],
    ['let Object = f(); x = await Object.hasOwn(y, 1)', true],
    ['x = await client.fetch(query)', false],
    ['x = await client[name](query)', false],
    ['class A { #has() {} m() { return this.#has() } }; x = await 1', false],
    ['x = await load(id)', false],
    ['x = await value', false],
  ])('answers %s with %s', (source, expected) => {
    let { context, find } = createTestContext(
      `async function f() { ${source} }`,
    )

    expect(isTypedByMethodName(find('AwaitExpression').argument, context)).toBe(
      expected,
    )
  })
})
