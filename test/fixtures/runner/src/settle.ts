export async function settle(quick: boolean): Promise<string> {
  await new Promise(resolve => {
    setTimeout(resolve, Number(quick ? 1 : 4000))
  })
  return 'done'
}
