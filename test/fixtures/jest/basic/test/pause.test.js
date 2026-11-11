const { PAUSED } = require('../src/pause')

// Loops without reaching a mutant, so only the watchdog stops it.
test('waits while paused', () => {
  while (PAUSED) {
    // Spin.
  }
})
