exports.greet = (name, loud) => {
  let text = loud ? name.toUpperCase() : name
  console.log(text)
  return text.length
}
