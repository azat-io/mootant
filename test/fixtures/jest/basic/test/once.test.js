const { writeFileSync, existsSync } = require('node:fs')
const path = require('node:path')

const { isOn } = require('../src/once')

jest.retryTimes(1)

let marker = path.join(__dirname, 'once-ran')
let attempts = 0

// Only the first run of the file reaches the mutant, so every later run fails
// its first attempt with no reach at all, and passes on retry.
test('passes on retry', () => {
  attempts += 1
  if (!existsSync(marker)) {
    writeFileSync(marker, '')
    isOn()
  }
  expect(attempts).toBe(2)
})
