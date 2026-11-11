const fs = require('node:fs')

module.exports = {
  report: (descriptor, text) => {
    if (text.length > 1) {
      fs.writeSync(descriptor, text)
    }
  },
}
