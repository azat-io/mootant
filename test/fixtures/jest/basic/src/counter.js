let count = 0

module.exports = {
  increment: () => {
    count += 1
  },
  current: () => count,
}
