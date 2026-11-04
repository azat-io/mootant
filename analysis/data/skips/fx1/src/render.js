export function renderAll(items) {
  let rendered = 0
  for (let i = 0; i < items.length; i++) {
    items[i].render()
    rendered++
  }
  return rendered
}
