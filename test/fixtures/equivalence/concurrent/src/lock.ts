let busy: Promise<void> | null = null
let inside = 0

export async function exclusive(work: () => Promise<void>): Promise<number> {
  while (busy !== null) {
    await busy
  }
  let done!: () => void
  busy = new Promise<void>(resolve => {
    done = resolve
  })
  inside += 1
  let seen = inside
  try {
    await work()
    return seen
  } finally {
    inside -= 1
    busy = null
    done()
  }
}
