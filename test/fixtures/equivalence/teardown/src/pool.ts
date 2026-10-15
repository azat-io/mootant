let open = 0

export function acquire(): void {
  open += 1
}

export function release(): void {
  open -= 1
}

export function countOpen(): number {
  return open
}
