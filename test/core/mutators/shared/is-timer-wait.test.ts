import { describe, expect, it } from 'vitest'

import { isTimerWait } from '../../../../core/mutators/shared/is-timer-wait'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Promise timer import of every snippet.
 */
const IMPORT = "import { setTimeout } from 'node:timers/promises'"

describe('isTimerWait', () => {
  it.each([
    'await setTimeout(1000)',
    'await (setTimeout(1000))',
    'await scheduler.wait(1000)',
    'for (await setTimeout(1); ok;) {}',
  ])('accepts %s', code => {
    let { context, find } = createTestContext(`${IMPORT}\n${code}`)

    expect(isTimerWait(find('AwaitExpression'), context)).toBe(true)
  })

  it.each([
    'let v = await setTimeout(1000)',
    'await load(1000)',
    'await setTimeout',
    'await setTimeout(1000).then(run)',
  ])('rejects %s', code => {
    let { context, find } = createTestContext(`${IMPORT}\n${code}`)

    expect(isTimerWait(find('AwaitExpression'), context)).toBe(false)
  })
})
