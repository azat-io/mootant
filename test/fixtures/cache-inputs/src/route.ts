export async function route(flag: boolean): Promise<number> {
  if (flag) {
    return 1
  }
  let lazy = await import('./lazy')
  return lazy.value()
}
