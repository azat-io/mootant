function getPool(): { open: number } {
  return (globalThis as unknown as { pool: { open: number } }).pool
}

export function acquire(): void {
  getPool().open += 1
}

export function release(): void {
  getPool().open -= 1
}

export function countOpen(): number {
  return getPool().open
}
