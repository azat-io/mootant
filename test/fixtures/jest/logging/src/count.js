exports.count = items => {
  console.log('counting', items.length)
  return items.filter(Boolean).length
}
