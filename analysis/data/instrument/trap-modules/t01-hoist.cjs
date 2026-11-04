// Sloppy-mode CommonJS: Annex B function-in-block hoisting, var hoisting, TDZ.
function g(flag) {
  var out = []
  out.push(typeof inner)
  if (flag) {
    function inner() { return 'inner' + 1 }
    out.push(inner())
  }
  out.push(typeof inner)
  for (var i = 0; i < 2; i++) out.push(i * 10)
  out.push(i + 1)
  return out
}
function h(x) {
  var r = []
  try { r.push(later + 1) } catch (e) { r.push(e.name) }
  let later = x * 2
  { let shadow = x + 1; r.push(shadow) }
  try { r.push(K.name) } catch (e) { r.push(e.name) }
  class K {}
  r.push(typeof K)
  return r
}
function completion() {
  return [eval('1; if (true) {}'), eval('2; { }'), eval('var q = 3; q + 1'), eval('4; foo()'), eval('5; if (false) 6')]
}
function foo() { return 7 + 0 }
exports.probe = () => ({ g1: g(true), g0: g(false), h: h(3), completion: completion() })
