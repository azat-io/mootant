function make(flag, opts) {
  let f = function () { return 1 + 1 }
  let g = flag || function () { return 2 }
  let h = opts.fn ?? (() => 3)
  let i = flag && (() => 4)
  let C = flag ? class {} : class {}
  let D = opts.cls || class {}
  let o = { p: () => 5, q: flag || function () {} }
  let j
  j = opts.fn || function () {}
  let { k = () => 6 } = opts
  function dflt(cb = opts.fn || (() => 7)) { return cb.name }
  class Fields { static s = flag || (() => 8); m = opts.fn ?? (() => 9) }
  return [f.name, g.name, h.name, i && i.name, C.name, D.name, o.p.name, o.q.name, j.name, k.name, dflt(), Fields.s.name, new Fields().m.name]
}
export function probe() {
  return { a: make(false, {}), b: make(true, { fn: function named() {} }) }
}
