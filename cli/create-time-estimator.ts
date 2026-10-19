/**
 * Running estimate of the time left in one run of the test runner.
 */
export interface TimeEstimator {
  /**
   * Takes the end of a unit.
   *
   * @param end - The unit and how long it took.
   * @param now - Time of the end, in milliseconds of `performance.now()`.
   */
  end(end: EstimatedEnd, now: number): void

  /**
   * Tells the time left, once enough of the run finished to tell it and until
   * the run ends.
   *
   * @param now - Current time, in milliseconds of `performance.now()`.
   * @returns Milliseconds, or null while unknown, once every unit ended and
   *   once the estimated end passed.
   */
  left(now: number): number | null
}

/**
 * Units of a run of the test runner as the time left is estimated from.
 */
interface EstimatedPlan {
  /**
   * Serial chain of each unit in plan order: units of one chain run one at a
   * time.
   */
  chains: readonly number[]

  /**
   * Expected milliseconds of each unit in plan order.
   */
  costs: readonly number[]

  /**
   * Units the run executes at once.
   */
  workers: number
}

/**
 * End of a unit as the estimate takes it.
 */
interface EstimatedEnd {
  /**
   * Milliseconds the unit ran, or null when unknown.
   */
  duration: number | null

  /**
   * Index of the unit in the plan, or null when unknown; the first unit not
   * finished yet then counts as finished.
   */
  unit: number | null
}

/**
 * Units of one serial chain not ended yet, kept while any is left.
 */
interface Chain extends Work {
  /**
   * End of the last unit of the chain, or the start of the run, in milliseconds
   * of `performance.now()`: the next unit started no earlier, but maybe later.
   */
  free: number
}

/**
 * Units and their expected milliseconds.
 */
interface Work {
  /**
   * Number of units.
   */
  units: number

  /**
   * Sum of the expected milliseconds of the units.
   */
  cost: number
}

/**
 * Milliseconds a run must take before its time left is estimated.
 */
const LEAST_TIME = 2000

/**
 * Units that must finish before the time left is estimated.
 */
const LEAST_UNITS = 3

/**
 * Share of the expected cost of the run that the units that ended must cover
 * before the time left is estimated, so units of every kind had a chance to
 * report.
 */
const LEAST_SHARE = 0.05

/**
 * Least and most milliseconds a unit runs per millisecond of its expected cost,
 * so a few odd durations cannot make the estimate absurd.
 */
const SPEED = { least: 0.05, most: 20 }

/**
 * Milliseconds of wall time over which the shown end of the run moves about two
 * thirds of the way to a new estimate.
 */
const SMOOTHING = 10_000

/**
 * Least milliseconds between two estimates.
 */
const REFRESH = 250

/**
 * Creates the estimate of the time left in one run of the test runner from the
 * expected costs of its units. A unit takes a worker for `overhead + speed ×
 * cost`: the speed is how long the units ran per millisecond of their cost, by
 * their reported durations (1 without any), so it learns, for one, that killed
 * units stop early; the overhead is the rest of the worker time spent per unit
 * so far, such as starting processes, waiting and idling (which measurements on
 * real runs favored over leaving idle workers out). Units of one serial chain,
 * such as one test file, run one at a time, so no more workers run than chains
 * with units not ended: workers idle for lack of chains spend no time of a
 * unit. The time left is the time of the units not ended, whatever order the
 * runner takes them in, spread over the workers, but at least the longest
 * serial chain left, less the time its running unit has run: the time since the
 * last unit of the chain ended, but no more than one unit of the chain, as the
 * unit may have waited for a worker until then; right after an end one unit
 * starts and the other running ones are half done. The shown end of the run
 * moves towards each new estimate over wall time, so it does not jump with
 * every unit, and it starts at the first estimate. The estimate shows once a
 * few units, two seconds and a twentieth of the expected cost of the run
 * passed, and hides once every unit ended or its end passed.
 *
 * @param plan - Expected costs, serial chains and workers of the run.
 * @param started - Start of the run, in milliseconds of `performance.now()`.
 * @returns Estimate to feed with the ends of units.
 */
export function createTimeEstimator(
  plan: EstimatedPlan,
  started: number,
): TimeEstimator {
  let { chains, costs } = plan
  let workers = Math.max(1, plan.workers)
  let ended = new Set<number>()
  let left: Work = { units: costs.length, cost: 0 }
  let serial = new Map<number, Chain>()
  for (let [index, chain] of chains.entries()) {
    let found = serial.get(chain) ?? { free: started, units: 0, cost: 0 }
    found.units += 1
    found.cost += costs[index]!
    serial.set(chain, found)
    left.cost += costs[index]!
  }
  let total = left.cost
  let spent = 0
  let timed = { duration: 0, cost: 0 }
  let next = 0
  let lastEnd = started
  let changed = false
  let estimated = -Infinity
  let expectedEnd = 0
  let shown: { end: number; at: number } | null = null

  /**
   * Tells the time left after the last end.
   *
   * @returns Milliseconds after the last end.
   */
  function estimate(): number {
    let running = (Math.min(workers, serial.size) - 1) / 2
    let share = { cost: (running * left.cost) / left.units, units: running }
    let passed = {
      units: costs.length - left.units + share.units,
      cost: total - left.cost + share.cost,
    }
    let speed = Math.min(
      timed.cost > 0 ?
        Math.min(SPEED.most, Math.max(SPEED.least, timed.duration / timed.cost))
      : 1,
      passed.cost > 0 ? spent / passed.cost : Infinity,
    )
    let overhead = (spent - speed * passed.cost) / passed.units

    /**
     * Tells how long units take one after another.
     *
     * @param work - The units.
     * @returns Milliseconds.
     */
    function time(work: Work): number {
      return overhead * work.units + speed * work.cost
    }

    let longest = Math.max(
      ...[...serial.values()].map(
        chain =>
          time(chain) -
          Math.min(lastEnd - chain.free, time(chain) / chain.units),
      ),
    )
    return Math.max(
      time({
        units: left.units - share.units,
        cost: left.cost - share.cost,
      }) / workers,
      longest,
    )
  }

  return {
    end(end, now) {
      let index = end.unit
      if (index === null || ended.has(index)) {
        while (ended.has(next)) {
          next += 1
        }
        index = next
      }
      if (index >= costs.length) {
        return
      }
      let cost = costs[index]!
      let chain = serial.get(chains[index]!)!
      ended.add(index)
      spent += (now - lastEnd) * Math.min(workers, serial.size)
      chain.free = now
      lastEnd = now
      changed = true
      for (let work of [left, chain]) {
        work.units -= 1
        work.cost -= cost
      }
      if (chain.units === 0) {
        serial.delete(chains[index]!)
      }
      if (end.duration !== null) {
        timed.duration += end.duration
        timed.cost += cost
      }
    },
    left(now) {
      if (
        left.units === 0 ||
        costs.length - left.units < LEAST_UNITS ||
        now - started < LEAST_TIME ||
        total - left.cost < LEAST_SHARE * total
      ) {
        return null
      }
      if (changed && now - estimated >= REFRESH) {
        changed = false
        estimated = now
        expectedEnd = lastEnd + estimate()
      }
      shown = {
        end:
          shown === null ? expectedEnd : (
            expectedEnd +
            (shown.end - expectedEnd) * Math.exp(-(now - shown.at) / SMOOTHING)
          ),
        at: now,
      }
      let rest = shown.end - now
      return rest > 0 ? rest : null
    },
  }
}
