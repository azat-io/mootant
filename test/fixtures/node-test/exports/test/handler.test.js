import assert from 'node:assert/strict'
import { test } from 'node:test'

import metrics from '../lib/metrics.cjs'

test('handles a request once registered', () => {
  assert.equal(metrics.handler.handle(1), 2)
})
