exports.ping = async () => {
  let response = await fetch(`${process.env.STATUS_URL}/ping`)
  return response.ok ? response.text() : 'down'
}
