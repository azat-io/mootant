const base = { greet() { return 'base' }, get g() { return 1 + 1 } }
function make(flag) {
  return {
    __proto__: base,
    greet() { return super.greet() + (flag ? '!' : '?') },
    get g() { return super.g * 10 },
    other: flag && 1 + 1,
    ['k' + 1]: 2 * 3,
    ...(flag ? { spread: 1 } : {}),
  }
}
function args(a, b = a + 1) {
  arguments[0] = 99
  return [a, b, arguments.length, arguments[0]]
}
function tf(x) {
  try {
    if (x > 1) throw new Error('big' + x)
    return 'small'
  } catch {
    return 'caught'
  } finally {
    if (x > 5) return 'override'
  }
}
const t = s => s
function sites() {
  let list = [t`a`, t`b`, Math.max(1, 2)]
  let again = [t`a`]
  return [list[0] === again[0], list.length, list[0].raw[0]]
}
export function probe() {
  let a = make(true)
  let b = make(false)
  return { a: [a.greet(), a.g, a.other, a.k1, a.spread, Object.keys(a)], b: [b.greet(), b.other, Object.keys(b)], args: [args(1), args(1, 5)], tf: [tf(0), tf(3), tf(7)], sites: sites() }
}
