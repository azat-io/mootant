module.exports = {
  wait: ready =>
    new Promise(resolve => {
      if (ready) {
        resolve()
      }
    }),
}
