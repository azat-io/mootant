module.exports = {
  check: ok => {
    if (!ok) {
      process.exit(1)
    }
  },
}
