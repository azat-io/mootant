let log = []
function side(x) { log.push(x); return x }
function destr({ a = side(1), b = side(a + 1) } = {}, [c = side(b * 2), d = side(c - 1)] = []) {
  let { e = side(5), ...rest } = { f: side(6) }
  let [g = side(7), , h = side(8)] = [undefined, 0, 9]
  return [a, b, c, d, e, rest, g, h]
}
function shortCircuit(x, y) {
  let r = []
  r.push(x && side('and' + 1))
  r.push(x || side('or' + 1))
  r.push(y ?? side('nullish' + 1))
  r.push(x ? side('t' + 1) : side('f' + 1))
  let z = y
  z ||= side('assign' + 1)
  z &&= side('and-assign' + 1)
  r.push(z)
  return r
}
function order() {
  let o = { [side('k1')]: side('v1'), [side('k2')]: side('v2') }
  return [side(1) + side(2) * side(3), (side(x => x + 1))(side(2)) ?? 0, o]
}
side.toString = () => 'side'
export function probe() {
  let a = destr()
  let b = destr({ a: 10 }, [3])
  let c = shortCircuit(0, null)
  let d = shortCircuit(1, 2)
  let e
  try { e = order() } catch (err) { e = err.name }
  return { a, b, c, d, e, log }
}
