// Module-level binding named globalThis whose initializer has mutant sites.
const globalThis = typeof window !== 'undefined' ? window : { name: 'node' + 1 }
export function probe() {
  return { r: [globalThis.name] }
}
