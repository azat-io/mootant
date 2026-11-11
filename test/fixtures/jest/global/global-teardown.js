const { writeFileSync } = require('node:fs')
const path = require('node:path')

module.exports = async () => {
  await new Promise(resolve => {
    globalThis.store.close(resolve)
  })
  writeFileSync(path.join(__dirname, 'store-closed'), '')
}
