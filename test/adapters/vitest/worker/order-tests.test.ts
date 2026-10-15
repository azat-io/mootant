import { describe, expect, it } from 'vitest'

import { orderTests } from '../../../../adapters/vitest/worker/order-tests'

/**
 * Creates a file with concurrent and shuffled suites and tests.
 *
 * @returns Fake collected file.
 */
function createFile(): never {
  return {
    tasks: [
      { concurrent: true, type: 'test' },
      {
        tasks: [{ concurrent: true, type: 'test' }],
        concurrent: true,
        type: 'suite',
        shuffle: true,
      },
    ],
    concurrent: true,
    shuffle: true,
  } as never
}

describe('orderTests', () => {
  it('turns off concurrency and shuffling in every suite and test when sequential', () => {
    let file = createFile()

    expect(orderTests(file, true)).toBe(true)
    expect(file).toStrictEqual({
      tasks: [
        { concurrent: false, type: 'test' },
        {
          tasks: [{ concurrent: false, type: 'test' }],
          concurrent: false,
          shuffle: false,
          type: 'suite',
        },
      ],
      concurrent: false,
      shuffle: false,
    })
  })

  it('keeps concurrency and only turns off shuffling otherwise', () => {
    let file = createFile()

    expect(orderTests(file, false)).toBe(true)
    expect(file).toStrictEqual({
      tasks: [
        { concurrent: true, type: 'test' },
        {
          tasks: [{ concurrent: true, type: 'test' }],
          concurrent: true,
          shuffle: false,
          type: 'suite',
        },
      ],
      concurrent: true,
      shuffle: false,
    })
  })

  it('tells whether anything was concurrent', () => {
    let nested = {
      tasks: [
        { type: 'test' },
        { tasks: [{ concurrent: true, type: 'test' }], type: 'suite' },
      ],
    } as never

    expect(orderTests({ tasks: [{ type: 'test' }] } as never, true)).toBe(false)
    expect(orderTests(nested, false)).toBe(true)
  })
})
