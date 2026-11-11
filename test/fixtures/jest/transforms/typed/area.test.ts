let { area, fits, unit } = require('./area') as {
  fits(box: { height: number; width: number }, limit: number): boolean
  area(box: { height: number; width: number }): number
  unit: string
}

test('measures a box', () => {
  let box: { height: number; width: number } = { height: 3, width: 2 }
  expect(area(box)).toBe(6)
  expect(fits(box, 10)).toBe(true)
  expect(unit).toBe('cm')
})
