let log = []
function run(x) { log.push(x); return run }
export function probe() {
  let a = 1
  let b = a + 1
  ;[a, b].forEach(x => log.push(x * 2))
  ;(a > 0 ? run : log.push)(a - 1)
  let c = a
  ;`t${a + 1}`.split('').forEach(x => log.push(x))
  run(a + 2)
  ;-a < 0 && log.push('neg')
  let d = b
  ++d
  log.push(d * 1)
  let e = a ? 'x' : 'y'
  ;/a/.test('a') && log.push('re' + 1)
  return { log, c, e }
}
