exports.report = count => {
  console.info(`found ${count} ${count === 1 ? 'entry' : 'entries'}`)
}

exports.warn = reason => {
  console.warn('skipped', reason)
  console.warn('done')
  return reason.length
}

exports.introduce = user => {
  console.log(user.name)
}

exports.notify = context => {
  context.logger.info('sent')
}

exports.finish = logger => {
  logger?.info('done')
  return 'finished'
}

exports.dump = value => {
  console.log('%j', value)
}

exports.hide = value => {
  console.log(`\x25j`, value)
}

exports.close = () => {
  console.error()
}

exports.build = () => {
  let entries = []
  function log(text) {
    entries.push(text)
  }
  log('built')
  return entries
}

exports.announce = logger => {
  logger.info('ready')
}

exports.record = console => {
  console.info('kept')
}
