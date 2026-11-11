export async function runPlugin(name, value) {
  let plugin = await import(`../plugins/${name}.mjs`)
  return plugin.run(value) + 1
}
