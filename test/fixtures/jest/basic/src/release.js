module.exports = {
  release: open => {
    if (open) {
      throw new Error('Still open')
    }
  },
}
