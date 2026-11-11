module.exports = {
  createUser: async (name, age) => {
    let response = await fetch(`${process.env.STORE_URL}/${name}`, {
      method: 'PUT',
    })
    return { status: response.status, adult: age >= 18 }
  },
}
