export function check(ok) {
  if (!ok) {
    process.kill(process.pid, 'SIGKILL')
  }
  return ok
}
