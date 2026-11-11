module.exports = {
  load: ok => (ok ? Promise.resolve() : Promise.reject(new Error('No data'))),
}
