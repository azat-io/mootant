export function isExpired(expires: Date, now: Date): boolean {
  return expires < now
}

export function notify(expires: Date, now: Date, send: () => void): void {
  if (expires < now) {
    send()
  }
}
