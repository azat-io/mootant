const { count } = require('../src/count')

test('counts without writing to standard output while the test runs', () => {
  let write = jest.spyOn(process.stdout, 'write')
  let counted = count([1, 0, 2])
  let writes = write.mock.calls.length
  write.mockRestore()
  expect(writes).toBe(0)
  expect(counted).toBe(2)
})
