let http = require('node:http')

module.exports = async () => {
  let server = http.createServer((request, response) => {
    response.end(request.url === '/ping' ? 'pong' : 'unknown')
  })
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  process.env.STATUS_URL = `http://127.0.0.1:${server.address().port}`
  globalThis.statusServer = server
}
