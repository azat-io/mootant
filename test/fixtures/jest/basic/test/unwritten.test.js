const fs = require('node:fs')

const { isWide } = require('../src/unwritten')

// Fails writes the way `mock-fs` does, which even a captured `writeSync` meets.
test('reaches its mutant while writes fail', () => {
  let binding = process.binding('fs')
  let { writeString, writeBuffer } = binding
  binding.writeString = () => {
    throw new Error('No writes')
  }
  binding.writeBuffer = binding.writeString
  let wide
  try {
    expect(() => fs.writeSync(2, '')).toThrow('No writes')
    wide = isWide(2)
  } finally {
    binding.writeString = writeString
    binding.writeBuffer = writeBuffer
  }
  expect(wide).toBe(true)
})
