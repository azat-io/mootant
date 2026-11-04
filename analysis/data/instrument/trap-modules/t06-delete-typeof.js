function del(obj, key) {
  let a = delete obj[key + '1']
  let b = delete obj.x
  let c = delete obj?.y
  return [a, b, c, Object.keys(obj)]
}
function ty(o) {
  let a = typeof undeclaredThing === 'undefined'
  let b = typeof undeclaredThing
  let c = typeof (undeclaredThing)
  let d = typeof o?.p === 'string' ? 'str' : 'other'
  return [a, b, c, d]
}
export function probe() {
  return { del: del({ k1: 1, x: 2, y: 3, z: 4 }, 'k'), ty: ty({ p: 's' }), ty2: ty({}) }
}
