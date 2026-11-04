class Box {
  #v = 1
  constructor(v) { this.#v = v }
  get(k) { return this === undefined ? 'no-this' : this.#v + k }
  #priv(k) { return this.#v * k }
  run(k) { return [this.#priv(k + 1), this.get?.(k - 1)] }
  static has(o) { return #v in o && o.#v > 0 }
}
export function probe() {
  let box = new Box(5)
  let k = 1
  let other = { get: box.get }
  let r = []
  r.push(box.get(k + 1))
  r.push((box.get)(k + 2))
  r.push(box?.get(k + 3))
  r.push(box.get?.(k + 4))
  r.push(box[k > 0 ? 'get' : 'run'](k))
  r.push(box.run(k * 2))
  r.push(Box.has(box), Box.has({}))
  try { r.push((0, box.get)(1)) } catch (e) { r.push(e.name) }
  try { r.push(other.get(1)) } catch (e) { r.push(e.name) }
  let tag = { t(strings, ...values) { return [this === tag, strings.raw.join('|'), values] } }
  r.push(tag.t`a${k + 1}b\n${k * 2}`)
  r.push(String.raw`x\n${k + 1}y`)
  return { r }
}
