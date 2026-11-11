const { writeFileSync } = require('node:fs')
const path = require('node:path')

module.exports = config => {
  writeFileSync(path.join(config.rootDir, 'teardown-ran'), '')
}
