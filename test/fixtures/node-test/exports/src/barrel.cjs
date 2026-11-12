'use strict'
var __exportStar = function (m, target) {
  for (var p in m) {
    if (p !== 'default' && !Object.prototype.hasOwnProperty.call(target, p)) {
      target[p] = m[p]
    }
  }
}
Object.defineProperty(exports, '__esModule', { value: true })
exports.label = function label(width, height) {
  return width + 'x' + height
}
__exportStar(require('./shapes.cjs'), exports)
