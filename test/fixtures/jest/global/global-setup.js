const http = require('node:http')

// A store in the host: a key can be created once until it is deleted, for the
// life of the setup.
module.exports = async () => {
  let names = new Set()
  let store = http.createServer((request, response) => {
    let name = request.url.slice(1)
    if (request.method === 'DELETE') {
      names.delete(name)
      response.statusCode = 204
    } else {
      response.statusCode = names.has(name) ? 409 : 201
      names.add(name)
    }
    response.end()
  })
  await new Promise(resolve => {
    store.listen(0, '127.0.0.1', resolve)
  })
  process.env.STORE_URL = `http://127.0.0.1:${store.address().port}`
  globalThis.store = store
}
