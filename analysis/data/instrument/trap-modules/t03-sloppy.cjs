function s(a) {
  return [this === undefined ? a + 1 : a - 1, typeof this]
}
function u(a, b) {
  arguments[0] = a * 10
  return [a, arguments.length + 0, arguments[0]]
}
function w(obj) {
  with (obj) {
    return [x + 1, typeof y, z * 2]
  }
}
function ev(x) {
  var local = x + 1
  return [eval('local * 2'), (0, eval)('typeof local'), new Function('a', 'return a + 1')(x)]
}
exports.probe = () => ({ s: s(1), u: u(1, 2), w: w({ x: 1, z: 3 }), ev: ev(2) })
