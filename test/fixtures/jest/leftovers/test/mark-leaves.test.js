const { performance: timeline } = require('node:perf_hooks')

const { leaves, scale } = require('../src/mark-leaves')

// Clears on its way, so a run with no mutant after a failure sees nothing.
test('finds no mark, and leaves one under the mutant', () => {
  expect(scale(2)).toBeGreaterThan(0)
  let marks = timeline.getEntriesByName('own mark')
  timeline.clearMarks('own mark')
  expect(marks).toHaveLength(0)
  if (leaves()) {
    timeline.mark('own mark')
  }
})
