module.exports = {
  later: (work, delay) => {
    setTimeout(work, delay + 1)
  },
}
