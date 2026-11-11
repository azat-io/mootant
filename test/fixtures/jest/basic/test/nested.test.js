const { negate } = require('../src/nested')

describe('outer', () => {
  describe('inner', () => {
    test('negates', () => {
      expect(negate(1)).toBe(-1)
    })
  })
})
