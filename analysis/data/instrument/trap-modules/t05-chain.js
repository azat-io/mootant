function chain(a, i) {
  let x = a?.b.c
  let y = a?.list[i + 1]
  let z = a?.fn(i * 2).value
  let w = a?.b?.c ?? 'none'
  let v = a?.['b']?.['c']
  let u = (a?.b).c
  return [x, y, z, w, v, u]
}
export function probe() {
  let out = []
  for (let a of [null, undefined, { b: { c: 3 }, list: [1, 2, 3], fn: n => ({ value: n + 1 }) }]) {
    for (let i of [0, 1]) {
      try { out.push(chain(a, i)) } catch (e) { out.push(e.name) }
    }
  }
  return { out }
}
