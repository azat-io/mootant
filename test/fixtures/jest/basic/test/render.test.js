const { italic, bold } = require('../src/render')

test('matches a committed snapshot', () => {
  expect(bold('a')).toMatchSnapshot()
})

test('matches an inline snapshot', () => {
  expect(italic('a')).toMatchInlineSnapshot(`"<i>a</i>"`)
})
