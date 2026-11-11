module.exports = {
  connect: address => {
    if (address === '') {
      throw new Error('No address')
    }
  },
}
