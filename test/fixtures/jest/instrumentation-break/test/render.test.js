const { render } = require('../src/render')

test('renders a name, and its source is as written', () => {
  expect(render('Ann')).toBe('<b>Ann</b>')
  expect(render.toString()).toBe(
    "name => (name === '' ? '<b>?</b>' : `<b>${name}</b>`)",
  )
})
