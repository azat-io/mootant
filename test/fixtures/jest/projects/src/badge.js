exports.badge = count => {
  let element = document.createElement('span')
  element.textContent = count > 99 ? '99+' : String(count)
  return element
}
