let calls = []
const obj = {
  get g() { calls.push('get'); return 1 + 1 },
  set s(v) { calls.push('set' + v) },
  ['comp' + 'uted']: 2 * 3,
  __proto__: { inherited: 1 + 0 },
}
export const value = obj.g + obj.computed
export default (x => x * 2)
export function probe() {
  obj.s = 4 - 1
  let n = new Number(5 + 1)
  let big = 10n ** 2n + 1n
  let tmpl = `a${1 + 1}b${'c'}`
  let ex = [obj.inherited, Object.getPrototypeOf(obj) === Object.prototype, value]
  let url = typeof import.meta.url
  let $src = probe.toString().length > 0
  return { calls, n: Number(n), big: String(big), tmpl, ex, url, $src }
}
