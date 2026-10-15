import type { IsolatedReason } from '../../types/run/isolated-reason'
import type { DryAnalysis } from '../../types/run/dry-analysis'
import type { MutantClass } from '../../types/run/mutant-class'
import type { Mutant } from '../../types/mutant/mutant'

import { sortTests } from './sort-tests'

/**
 * Options that send covered mutants to the isolated path.
 */
interface ClassifySettings {
  /**
   * Whether the adapter can run batch plans.
   */
  batch: boolean

  /**
   * Whether the run is in fast mode (`--fast`); otherwise every covered mutant
   * runs isolated.
   */
  fast: boolean
}

/**
 * Decides the route of every pending mutant from the dry run, first match wins:
 * reached while a test file loaded → isolated (`static`); reached by no test →
 * no coverage; outside fast mode → isolated without a reason; reached by an
 * unrepeatable test, reached by a test in only one of its tries, or an adapter
 * without batch mode → isolated with that reason; otherwise → batch.
 *
 * @param mutants - Pending mutants of the switched files.
 * @param analysis - Coverage and stability of the dry run.
 * @param settings - Whether the run is in fast mode and whether batch is
 *   available.
 * @returns Route of every mutant by id.
 */
export function classifyMutants(
  mutants: readonly Mutant[],
  analysis: DryAnalysis,
  settings: ClassifySettings,
): Map<string, MutantClass> {
  let classes = new Map<string, MutantClass>()
  for (let { id } of mutants) {
    let stable = analysis.stable.get(id) ?? new Set<string>()
    let firstReach = analysis.firstReach.get(id) ?? new Set<string>()
    let covering = new Set([...stable, ...firstReach])
    let isStatic = analysis.loadCovers.has(id)
    let reason = getIsolatedReason({
      unrepeatable: [...covering].some(test => analysis.unrepeatable.has(test)),
      firstReach: firstReach.size > 0,
      covered: covering.size > 0,
      static: isStatic,
      settings,
    })
    if (reason !== null || (covering.size > 0 && !settings.fast)) {
      classes.set(id, {
        coveredBy: sortTests(covering, analysis),
        path: 'isolated',
        static: isStatic,
        reason,
      })
    } else if (stable.size > 0) {
      classes.set(id, {
        coveredBy: sortTests(stable, analysis),
        static: false,
        path: 'batch',
        reason: null,
      })
    } else {
      classes.set(id, {
        static: false,
        coveredBy: [],
        reason: null,
        path: null,
      })
    }
  }
  return classes
}

/**
 * Picks why a mutant takes the isolated path.
 *
 * @param facts - What the dry run found about the mutant.
 * @param facts.settings - Whether the run is in fast mode and whether batch is
 *   available.
 * @param facts.unrepeatable - Whether an unrepeatable test reached it.
 * @param facts.firstReach - Whether a test reached it in only one try.
 * @param facts.covered - Whether any test reached it.
 * @param facts.static - Whether a test file reached it while loading.
 * @returns The first reason that applies, or null for batch, no coverage, or a
 *   covered mutant outside fast mode.
 */
function getIsolatedReason(facts: {
  settings: ClassifySettings
  unrepeatable: boolean
  firstReach: boolean
  covered: boolean
  static: boolean
}): IsolatedReason | null {
  if (facts.static) {
    return 'static'
  }
  if (!facts.covered || !facts.settings.fast) {
    return null
  }
  if (facts.unrepeatable) {
    return 'unrepeatable'
  }
  if (facts.firstReach) {
    return 'first-reach'
  }
  if (!facts.settings.batch) {
    return 'no-batch'
  }
  return null
}
