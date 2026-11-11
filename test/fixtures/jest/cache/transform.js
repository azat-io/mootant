let { createHash } = require('node:crypto')
let { readFileSync } = require('node:fs')
let path = require('node:path')

let options

function readOptions() {
  options ??= readFileSync(path.join(__dirname, 'transform.json'), 'utf8')
  return options
}

module.exports = {
  getCacheKey(code, file) {
    return createHash('sha1')
      .update(code)
      .update(file)
      .update(readOptions())
      .digest('hex')
  },
  process(code) {
    readOptions()
    return { code }
  },
}
