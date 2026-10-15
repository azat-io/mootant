let count = 0

export function bump(): void {
  count += 1
}

export function read(): number {
  return count
}
