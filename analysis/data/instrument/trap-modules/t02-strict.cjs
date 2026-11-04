'use strict'
function s(a) {
  return [this === undefined ? a + 1 : a - 1, typeof this]
}
function t() {
  'use strict'
  try { undeclaredGlobal = 1 + 1; return 'assigned' } catch (e) { return e.name }
}
function u(a, b) {
  arguments[0] = a * 10
  return [a, arguments.length + 0, arguments[0]]
}
exports.probe = () => ({ s: s(1), t: t(), u: u(1, 2) })
