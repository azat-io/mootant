export function report(count) {
  console.info(`found ${count} ${count === 1 ? 'entry' : 'entries'}`)
}

export function warn(reason) {
  console.warn('skipped', reason)
  console.warn('done')
  return reason.length
}

export function introduce(user) {
  console.log(user.name)
}

export function notify(context) {
  context.logger.info('sent')
}

export function finish(logger) {
  logger?.info('done')
  return 'finished'
}

export function dump(value) {
  console.log('%j', value)
}

export function hide(value) {
  console.log(`\x25j`, value)
}

export function close() {
  console.error()
}

export function build() {
  let entries = []
  function log(text) {
    entries.push(text)
  }
  log('built')
  return entries
}

export function announce(logger) {
  logger.info('ready')
}

export function record(console) {
  console.info('kept')
}
