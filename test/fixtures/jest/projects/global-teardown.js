module.exports = async () => {
  await new Promise(resolve => {
    globalThis.statusServer.close(resolve)
  })
}
