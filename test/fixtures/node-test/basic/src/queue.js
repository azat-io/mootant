let busy = null

export async function exclusive(work) {
  while (busy !== null) {
    await busy
  }
  let done
  busy = new Promise(resolve => {
    done = resolve
  })
  try {
    return await work()
  } finally {
    busy = null
    done()
  }
}
