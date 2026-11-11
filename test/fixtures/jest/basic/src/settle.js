module.exports = {
  settle: async pending => {
    while (pending.done === false) {
      await pending.promise
    }
  },
}
