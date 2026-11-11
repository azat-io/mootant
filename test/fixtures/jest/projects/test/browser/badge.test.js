const { badge } = require('../../src/badge')

test('shows a count in a badge', () => {
  expect(badge(5).textContent).toBe('5')
  expect(badge(120).textContent).toBe('99+')
})
