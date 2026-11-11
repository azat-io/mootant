const { title } = require('../src/title')

test('names the page where there is one', () => {
  if (typeof document === 'undefined') {
    expect(title()).toBe('no page')
  } else {
    document.title = 'Home'
    expect(title()).toBe('page: Home')
  }
})
