let running = 0
let peak = 0

export async function track(task) {
  running += 1
  peak = Math.max(peak, running)
  try {
    return await task()
  } finally {
    running -= 1
  }
}

export function getPeak() {
  return peak
}
