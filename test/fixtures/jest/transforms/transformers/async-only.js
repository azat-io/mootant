module.exports = {
  async processAsync(code) {
    await new Promise(resolve => {
      setImmediate(resolve)
    })
    return { code: code.replaceAll('__LATER__', 'later') }
  },
}
