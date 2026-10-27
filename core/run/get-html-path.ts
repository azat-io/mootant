import path from 'node:path'

/**
 * Path of the HTML report when the configuration names none, relative to the
 * project root.
 */
const DEFAULT_HTML_PATH = '.mootant/report.html'

/**
 * Decides where the HTML report of a run goes: `--html` turns it on and
 * `--no-html` off over `run.html` of the configuration, which is true, false or
 * a path relative to the project root. A run of single mutants (`--mutant`)
 * writes a report only with `--html`, so a re-check does not replace the report
 * of the whole run. A report without a configured path goes to
 * `.mootant/report.html`.
 *
 * @param option - True with `--html`, false with `--no-html`, else undefined.
 * @param setting - `run.html` of the configuration, or undefined.
 * @param context - Project root and whether the run picks single mutants.
 * @param context.picked - Whether `--mutant` picks the mutants of the run.
 * @param context.root - Project root.
 * @returns Absolute path of the report, or null when the run writes none.
 */
export function getHtmlPath(
  option: undefined | boolean,
  setting: undefined | boolean | string,
  context: { picked: boolean; root: string },
): string | null {
  let configured = !context.picked && setting !== undefined && setting !== false
  if (!(option ?? configured)) {
    return null
  }
  return path.resolve(
    context.root,
    typeof setting === 'string' ? setting : DEFAULT_HTML_PATH,
  )
}
