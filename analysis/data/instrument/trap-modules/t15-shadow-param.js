// A binding named globalThis in scope of a mutant site.
function scaled(globalThis, factor) {
  return globalThis.base * factor + 1
}
export function probe() {
  return { r: [scaled({ base: 2 }, 3)] }
}
