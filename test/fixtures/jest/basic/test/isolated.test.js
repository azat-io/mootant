test('loads in a registry of its own', () => {
  let isolated
  jest.isolateModules(() => {
    isolated = require('../src/isolated')
  })
  expect(isolated.subtract(3, 1)).toBe(2)
})
