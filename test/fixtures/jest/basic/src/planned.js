module.exports = {
  prepare: ready => {
    if (!ready) {
      throw new Error('Not ready')
    }
  },
}
