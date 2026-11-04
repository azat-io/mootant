export function connect(url) {
  if (!url.startsWith('mem://')) {
    throw new Error(`bad url ${url}`)
  }
  return {
    close() {
      return true
    },
    url,
  }
}

export function disconnect(db) {
  if (!db.close()) {
    throw new Error('close failed')
  }
}

export function selfDestruct(flag) {
  if (flag) {
    process.kill(process.pid, 'SIGKILL')
  }
  return 'alive'
}
