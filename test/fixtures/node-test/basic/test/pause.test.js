import { test } from 'node:test'

import { PAUSED } from '../src/pause.js'

// Loops without reaching a mutant, so only the watchdog stops it.
test('waits while paused', () => {
  while (PAUSED) {
    // Spin.
  }
})
