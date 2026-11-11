const { later } = require('../src/later')

test('runs the work once the time passed', () => {
  jest.useFakeTimers()
  let work = jest.fn()
  later(work, 99)
  jest.advanceTimersByTime(99)
  expect(work).not.toHaveBeenCalled()
  jest.advanceTimersByTime(1)
  expect(work).toHaveBeenCalledTimes(1)
  jest.useRealTimers()
})
