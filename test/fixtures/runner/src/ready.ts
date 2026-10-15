let ready = false

export function init(): void {
  ready = true
}

export function isReady(): boolean {
  return ready
}
