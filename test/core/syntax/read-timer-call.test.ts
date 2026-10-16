import { describe, expect, it } from 'vitest'

import { readTimerCall } from '../../../core/syntax/read-timer-call'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the timer of the last call of a snippet.
 *
 * @param source - Snippet whose last call is read.
 * @returns The timer, or null.
 */
function readLast(source: string): ReturnType<typeof readTimerCall> {
  let { scopes, find } = createTestFile(source)
  let calls = source.split('\n').at(-1)!
  return readTimerCall(scopes, find('CallExpression', calls))
}

/**
 * Callback timer with its delay second.
 */
const CALLBACK = { waits: false, delay: 1 }

/**
 * Promise timer that only waits, with its delay first.
 */
const WAIT = { waits: true, delay: 0 }

/**
 * Promise timer that does not only wait, with its delay first.
 */
const ITERATOR = { waits: false, delay: 0 }

describe('readTimerCall', () => {
  it.each([
    ['setTimeout(run, 100)', CALLBACK],
    ['setInterval(run, 100)', CALLBACK],
    ['(setTimeout as typeof f)(run, 100)', CALLBACK],
    ['window.setTimeout(run, 100)', CALLBACK],
    ['globalThis?.setInterval(run, 100)', CALLBACK],
    ['(self as any).setTimeout(run, 100)', CALLBACK],
    ['global.setTimeout(run, 100)', CALLBACK],
    ["window['setTimeout'](run, 100)", CALLBACK],
    [
      "import { setTimeout as later } from 'node:timers'\nlater(run, 100)",
      CALLBACK,
    ],
    ["import { setInterval } from 'timers'\nsetInterval(run, 100)", CALLBACK],
    [
      "import * as timers from 'node:timers'\ntimers.setTimeout(run, 1)",
      CALLBACK,
    ],
    ["import timers from 'timers'\ntimers['setInterval'](run, 1)", CALLBACK],
    [
      "import { setTimeout } from 'node:timers/promises'\nsetTimeout(100)",
      WAIT,
    ],
    ["import { setTimeout as sleep } from 'timers/promises'\nsleep(100)", WAIT],
    [
      "import { setTimeout } from 'node:timers/promises'\nsetTimeout(1, 'done')",
      WAIT,
    ],
    [
      "import { setTimeout } from 'node:timers/promises'\nsetTimeout(1, value)",
      ITERATOR,
    ],
    [
      "import { setTimeout as sleep } from 'node:timers/promises'\nsleep(100, pendingOperation)",
      ITERATOR,
    ],
    [
      "import { setTimeout } from 'node:timers/promises'\nsetTimeout(1, v, { signal })",
      ITERATOR,
    ],
    [
      "import { setTimeout } from 'node:timers/promises'\nsetTimeout(...args)",
      ITERATOR,
    ],
    [
      "import { setInterval } from 'node:timers/promises'\nsetInterval(100)",
      ITERATOR,
    ],
    ["import * as timers from 'timers/promises'\ntimers.setTimeout(1)", WAIT],
    [
      "import timers from 'node:timers/promises'\ntimers.setInterval(1)",
      ITERATOR,
    ],
    ['scheduler.wait(100)', WAIT],
    ['scheduler.wait(100, { signal })', ITERATOR],
    ["scheduler['wait'](100)", WAIT],
    [
      "import { scheduler } from 'node:timers/promises'\nscheduler.wait(100)",
      WAIT,
    ],
    [
      "import { scheduler as s } from 'timers/promises'\n(s as any).wait(100)",
      WAIT,
    ],
    [
      "import * as timers from 'node:timers/promises'\ntimers.scheduler.wait(1)",
      WAIT,
    ],
    [
      "import * as timers from 'node:timers/promises'\ntimers['scheduler'].wait(1)",
      WAIT,
    ],
  ])('reads %s', (source, expected) => {
    expect(readLast(source)).toStrictEqual(expected)
  })

  it.each([
    'run(1)',
    'delay(run, 100)',
    "timers['setTimeout'](run, 100)",
    'timers[0](run, 100)',
    'window[name](run, 100)',
    'globalThis[`setInterval`](run, 100)',
    'getWindow()?.setInterval(run, 100)',
    'cache.setTimeout(key, value)',
    'this.setTimeout(run, 100)',
    'let window = f\nwindow.setTimeout(run, 100)',
    "let timers = require('node:timers/promises')\ntimers.setTimeout(100, v)",
    "import { x } from 'node:timers/promises'\nx.setTimeout(run, 1)",
    "import { x } from 'node:timers'\nx.setTimeout(run, 1)",
    'timers.clearTimeout(id)',
    'f()()',
    'let setTimeout = f\nsetTimeout(run, 100)',
    "import { setTimeout } from 'sinon'\nsetTimeout(run, 100)",
    "import { clearTimeout } from 'node:timers'\nclearTimeout(run, 100)",
    "import { promisify } from 'node:util'\npromisify(run, 100)",
    "import * as timers from 'node:timers/promises'\ntimers.other(1)",
    'let scheduler = f\nscheduler.wait(100)',
    'queue.wait(100)',
    "import { scheduler } from 'node:timers'\nscheduler.wait(100)",
    "import { scheduler } from 'node:timers/promises'\nscheduler.yield(100)",
    "import * as timers from 'node:timers'\ntimers.scheduler.wait(1)",
    "import * as timers from 'node:timers/promises'\ntimers.other.wait(1)",
    'f().wait(1)',
  ])('reads no timer in %s', source => {
    expect(readLast(source)).toBeNull()
  })
})
