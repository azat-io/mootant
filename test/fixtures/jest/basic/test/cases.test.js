const { ENABLED } = require('../src/cases')

if (ENABLED) {
  test('runs when enabled', () => {
    expect(1).toBe(1)
  })
}
