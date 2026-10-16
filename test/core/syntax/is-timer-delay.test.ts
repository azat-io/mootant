import { describe, expect, it } from 'vitest'

import { isTimerDelay } from '../../../core/syntax/is-timer-delay'
import { createTestFile } from '../../helpers/create-test-file'

describe('isTimerDelay', () => {
  it.each([
    { source: 'setTimeout(run, 100)', type: 'Literal', text: '100' },
    {
      source: 'setTimeout(run, (100 as number))',
      type: 'Literal',
      text: '100',
    },
    {
      source: 'setInterval(tick, seconds * 1000)',
      type: 'BinaryExpression',
      text: 'seconds * 1000',
    },
    {
      source: 'setInterval(tick, seconds * 1000)',
      type: 'Identifier',
      text: 'seconds',
    },
    {
      source: 'setTimeout(run, quick ? 1 : 4000)',
      type: 'Identifier',
      text: 'quick',
    },
    {
      source: 'window.setTimeout(run, options?.delay ?? 300)',
      type: 'ChainExpression',
      text: 'options?.delay',
    },
    {
      source:
        "import { setTimeout } from 'node:timers/promises'\nsetTimeout(500)",
      type: 'Literal',
      text: '500',
    },
    {
      source: 'scheduler.wait(base * 2)',
      type: 'Literal',
      text: '2',
    },
    { source: "window['setTimeout'](run, 200)", type: 'Literal', text: '200' },
  ] as const)('accepts $text in $source', ({ source, type, text }) => {
    let { scopes, find, tree } = createTestFile(source)

    expect(isTimerDelay(tree, scopes, find(type, text))).toBe(true)
  })

  it.each([
    { source: 'setTimeout(run, 100, 5)', type: 'Literal', text: '5' },
    { source: 'setTimeout(100, run)', type: 'Literal', text: '100' },
    { source: 'delay(run, 100)', type: 'Literal', text: '100' },
    { source: 'setTimeout(run, f(100))', type: 'Literal', text: '100' },
    {
      source: 'setTimeout(run, f(100))',
      type: 'CallExpression',
      text: 'f(100)',
    },
    { source: 'setTimeout(run, n++ * 2)', type: 'Literal', text: '2' },
    { source: 'setTimeout(...args, 100)', type: 'Literal', text: '100' },
    { source: 'setTimeout(run, ...[100])', type: 'Literal', text: '100' },
    { source: 'new Timer(run, 100)', type: 'Literal', text: '100' },
    {
      source: 'setTimeout(() => save(1), 100)',
      type: 'Literal',
      text: '1',
    },
    {
      source: 'setTimeout(run, 100)',
      text: 'setTimeout(run, 100)',
      type: 'CallExpression',
    },
    { source: 'setTimeout(run, 100)', type: 'Identifier', text: 'setTimeout' },
    {
      source: 'setTimeout(run, function () { return 1 })',
      type: 'Literal',
      text: '1',
    },
    {
      source:
        "import { setTimeout } from 'node:timers/promises'\nsetTimeout(500, 1)",
      type: 'Literal',
      text: '1',
    },
    {
      source: 'let setTimeout = f\nsetTimeout(run, 100)',
      type: 'Literal',
      text: '100',
    },
    {
      source: "cache.setTimeout('key', 'value')",
      type: 'Literal',
      text: "'value'",
    },
    {
      source:
        "let timers = require('node:timers/promises')\ntimers.setTimeout(100, 'value')",
      type: 'Literal',
      text: "'value'",
    },
    {
      source:
        "let tp = await import('node:timers/promises')\ntp.setTimeout(10, 'x')",
      type: 'Literal',
      text: "'x'",
    },
  ] as const)('rejects $text in $source', ({ source, type, text }) => {
    let { scopes, find, tree } = createTestFile(source)

    expect(isTimerDelay(tree, scopes, find(type, text))).toBe(false)
  })

  it('rejects the program', () => {
    let { scopes, find, tree } = createTestFile('setTimeout(run, 100)')

    expect(isTimerDelay(tree, scopes, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { scopes, tree } = createTestFile('setTimeout(run, 100)')
    let other = createTestFile('setTimeout(run, 100)')

    expect(() =>
      isTimerDelay(tree, scopes, other.find('Literal', '100')),
    ).toThrow(Error)
  })
})
