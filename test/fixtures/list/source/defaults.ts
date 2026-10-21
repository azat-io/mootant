// Defaults that || would apply the same way (catalog 4.8): the swap to || is
// skipped where the left side is never falsy when defined, and so is the drop
// of a falsy default whose name is only read for its truth.

export function stamp(date?: Date): string | null {
  return date?.toISOString() ?? null // never '': no ||, so the mutant null comes back
}

export function quiet(options: { quiet?: boolean }): number {
  let quiet = options.quiet ?? false // read only for its truth: no || and no drop of false
  return quiet ? 1 : 2
}
