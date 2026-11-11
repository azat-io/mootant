test('starts over after a reset', () => {
  require('../src/renewed').bump()
  jest.resetModules()
  expect(require('../src/renewed').bump()).toBe(1)
})
