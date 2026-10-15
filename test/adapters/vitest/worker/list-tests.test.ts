import { describe, expect, it } from 'vitest'

import { listTests } from '../../../../adapters/vitest/worker/list-tests'

describe('listTests', () => {
  it('lists the tests of nested suites in file order', () => {
    let file = {
      tasks: [
        { type: 'test', id: 'a' },
        { tasks: [{ type: 'test', id: 'b' }], type: 'suite' },
        { type: 'test', id: 'c' },
      ],
    } as never

    expect(listTests(file).map(test => test.id)).toStrictEqual(['a', 'b', 'c'])
  })
})
