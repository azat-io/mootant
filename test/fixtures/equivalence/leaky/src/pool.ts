export function acquire(pool: { open: number }): void {
  pool.open += 1
}
