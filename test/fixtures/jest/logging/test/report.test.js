const {
  introduce,
  announce,
  record,
  report,
  finish,
  notify,
  build,
  close,
  dump,
  hide,
  warn,
} = require('../src/report')

test('reports the count', () => {
  let info = jest.spyOn(console, 'info').mockImplementation(() => {})
  report(2)
  expect(info.mock.calls[0]).toStrictEqual(['found 2 entries'])
  info.mockRestore()
})

test('warns without checking the message', () => {
  expect(warn('cache')).toBe(5)
})

test('fails to introduce nobody', () => {
  expect(() => introduce(null)).toThrow(TypeError)
})

test('fails to notify without a context', () => {
  expect(() => notify(null)).toThrow(TypeError)
})

test('finishes without a logger', () => {
  expect(finish()).toBe('finished')
})

test('fails to dump a bigint as JSON', () => {
  expect(() => dump({ id: 1n })).toThrow('BigInt')
  expect(() => hide({ id: 1n })).toThrow('BigInt')
})

test('closes without checking the output', () => {
  expect(close()).toBeUndefined()
})

test('builds the entries a local log function keeps', () => {
  expect(build()).toStrictEqual(['built'])
})

test('fails to announce without a logger', () => {
  expect(() => announce(null)).toThrow(TypeError)
})

test('records into a console it is given', () => {
  let lines = []
  record({ info: line => lines.push(line) })
  expect(lines).toStrictEqual(['kept'])
})
