import { getStep } from '../src/config.js'

// Not mutated (outside run.paths): a loop without mutant sites, so the hit
// limit cannot stop it when a mutant makes the step 0.
export function walk(n) {
  let step = getStep(true)
  let i = 0
  while (i < n) {
    i += step
  }
  return i
}
