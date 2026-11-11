let path = require('node:path')

module.exports = (request, options) =>
  request === '#limits' ?
    path.join(options.rootDir, 'src/limits.js')
  : options.defaultResolver(request, options)
