let path = require('node:path')

module.exports = {
  process(code, file, options) {
    if (!file.startsWith(options.config.rootDir + path.sep)) {
      throw new Error(
        `This transformer refuses a file outside the project: ${file}`,
      )
    }
    return { code }
  },
}
