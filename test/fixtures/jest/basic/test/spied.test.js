const fs = require('node:fs')

const { report } = require('../src/spied')

test('writes what is long enough, once', () => {
  let spy = jest.spyOn(fs, 'writeSync').mockReturnValue(0)
  report(1, 'x')
  expect(spy).not.toHaveBeenCalled()
  report(1, 'text')
  expect(spy).toHaveBeenCalledTimes(1)
  spy.mockRestore()
})
