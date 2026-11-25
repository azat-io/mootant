/**
 * Mutants of the sample shop in `docs/demo`, from `mootant list src` with each
 * preset.
 */
export const PRESET_STATS = [
  { command: 'mootant list src', name: 'recommended', mutants: 100 },
  { command: 'mootant list src --preset strict', name: 'strict', mutants: 142 },
]

/**
 * Screenshot of the demo report on the guide page of the report.
 */
export const REPORT_PREVIEW = {
  description:
    'Overview page of the report of a sample shop: mutation score 67.35%, 99 mutants in 8 files, 21 of them survived.',
  action: 'View the demo report',
}
