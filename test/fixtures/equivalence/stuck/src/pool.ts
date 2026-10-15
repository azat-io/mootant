export function closeAll(pool: { open: number }): void {
  pool.open = 0
}
