require('./registry.cjs').register('requests')

exports.offset = 1
exports.handler = require('../src/handler.cjs')
