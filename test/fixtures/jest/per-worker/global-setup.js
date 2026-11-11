const { writeFileSync, mkdirSync, rmSync } = require('node:fs')
const path = require('node:path')

// One resource per worker, as Jest's docs of `JEST_WORKER_ID` suggest, from the
// number of workers it is given.
module.exports = async globalConfig => {
  let directory = path.join(__dirname, 'resources')
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory)
  for (let id = 1; id <= globalConfig.maxWorkers; id += 1) {
    writeFileSync(path.join(directory, String(id)), '')
  }
}
