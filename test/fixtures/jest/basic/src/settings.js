const defaults = require('./settings.json')

module.exports = { withDefault: value => value + defaults.retries }
