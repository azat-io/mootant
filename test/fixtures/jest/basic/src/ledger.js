let balance = 0

module.exports = {
  deposit: amount => {
    balance += amount
  },
  getBalance: () => balance,
}
