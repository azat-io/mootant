export interface Logger {
  info(message: string): void
}

export function report(count: number): void {
  console.info(`found ${count} ${count === 1 ? 'entry' : 'entries'}`)
}

export function warn(reason: string): number {
  console.warn('skipped', reason)
  console.warn('done')
  return reason.length
}

export function introduce(user: { name: string }): void {
  console.log(user.name)
}

export function notify(context: { logger: Logger }): void {
  context.logger.info('sent')
}

export function finish(logger?: Logger): string {
  logger?.info('done')
  return 'finished'
}

export function dump(value: unknown): void {
  console.log('%j', value)
}

export function hide(value: unknown): void {
  console.log(`\x25j`, value)
}

export function close(): void {
  console.error()
}

export function build(): string[] {
  let entries: string[] = []
  function log(text: string): void {
    entries.push(text)
  }
  log('built')
  return entries
}

export function announce(logger: Logger): void {
  logger.info('ready')
}

export function record(console: Logger): void {
  console.info('kept')
}
