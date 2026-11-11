const { greet } = require('../../src/greet')

test('greets on standard output', () => {
  let written = []
  let write = jest.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    written.push(String(chunk))
    return true
  })
  greet('ann', true)
  write.mockRestore()
  expect(written.join('')).toContain('ANN')
})
