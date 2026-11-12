let metrics = require('../lib/metrics.cjs')

exports.handle = function handle(value) {
  return value + metrics.offset
}
