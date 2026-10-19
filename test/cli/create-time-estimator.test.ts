import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { createTimeEstimator } from '../../cli/create-time-estimator'

/**
 * Replays a recorded run of a real project, sampling the time left as the
 * spinner asks for it every 100 milliseconds.
 *
 * @param name - Name of the trace in `test/fixtures/traces`.
 * @param every - Milliseconds between two samples, a multiple of 100.
 * @returns Share of the round passed, actual and estimated milliseconds left of
 *   each sample with an estimate.
 */
function replayTrace(
  name: string,
  every: number,
): { estimate: number; actual: number; share: number }[] {
  let [plan, ...ends] = readFileSync(
    path.join(import.meta.dirname, '../fixtures/traces', `${name}.jsonl`),
    'utf8',
  )
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as unknown) as [
    { chains: number[]; costs: number[]; workers: number; end: number },
    ...[time: number, unit: number, duration: number | null][],
  ]
  let estimator = createTimeEstimator(plan, 0)
  let samples: { estimate: number; actual: number; share: number }[] = []
  let next = 0
  for (let now = 0; now <= plan.end; now += 100) {
    while (next < ends.length && ends[next]![0] <= now) {
      let [time, unit, duration] = ends[next]!
      estimator.end({ duration, unit }, time)
      next += 1
    }
    let estimate = estimator.left(now)
    if (estimate !== null && now % every === 0) {
      samples.push({ actual: plan.end - now, share: now / plan.end, estimate })
    }
  }
  return samples
}

/**
 * Builds a plan of units with test files of their own.
 *
 * @param costs - Expected milliseconds of each unit.
 * @param workers - Units the run executes at once.
 * @returns Plan with one serial chain per unit.
 */
function createPlan(
  costs: number[],
  workers: number,
): { chains: number[]; costs: number[]; workers: number } {
  return { chains: costs.map((_cost, index) => index), workers, costs }
}

describe('createTimeEstimator', () => {
  it('stays within about twice the time left on recorded rounds', () => {
    // The node:test round ends with one test file alone for 150 s, whose last
    // units run twice as long per millisecond of their cost as its first ones,
    // which nothing that ended tells.
    for (let [name, low, high, step] of [
      ['node-test-round', 0.5, 2, 40_000],
      ['vitest-round', 1, 2.1, 8000],
    ] as const) {
      let samples = replayTrace(name, 4000)
      let within = samples.filter(({ share }) => share >= 0.1 && share <= 0.75)

      expect(within.length).toBeGreaterThan(10)

      for (let { estimate, actual } of within) {
        expect(estimate / actual).toBeGreaterThanOrEqual(low)
        expect(estimate / actual).toBeLessThanOrEqual(high)
      }
      for (let [index, sample] of samples.slice(1).entries()) {
        expect(
          Math.abs(sample.estimate - samples[index]!.estimate),
        ).toBeLessThanOrEqual(step)
      }
    }
  })

  it('keeps a batch run with one oversized unit near its time left', () => {
    // Batch costs count every try of every mutant, so the unit expected to
    // take 34 s ran 5 s: the durations of the units that ended tell, and the
    // time its chain ran already counts.
    let samples = replayTrace('vitest-batch-round', 100)

    expect(samples.length).toBeGreaterThan(10)

    for (let { estimate, actual } of samples) {
      expect(estimate).toBeLessThan(actual + 4000)
    }
  })

  it('says nothing before a few units, two seconds and a twentieth of the cost passed', () => {
    let estimator = createTimeEstimator(createPlan([500, 500, 500, 500], 1), 0)

    expect(estimator.left(0)).toBeNull()

    estimator.end({ duration: null, unit: 0 }, 1000)
    estimator.end({ duration: null, unit: 1 }, 1500)
    estimator.end({ duration: null, unit: 2 }, 1900)

    expect(estimator.left(1900)).toBeNull()
    expect(estimator.left(2000)).toBeCloseTo(1900 + 1900 / 3 - 2000, 6)

    let costly = createTimeEstimator(createPlan([100, 100, 100, 10_000], 1), 0)
    for (let unit of [0, 1, 2]) {
      costly.end({ duration: null, unit }, (unit + 1) * 1000)
    }

    expect(costly.left(3000)).toBeNull()
  })

  it('counts down between ends and hides once every unit ended or the end passed', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 10 }, () => 1000),
        1,
      ),
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: null, unit }, (unit + 1) * 1000)
    }

    expect(estimator.left(3000)).toBe(7000)
    expect(estimator.left(5000)).toBe(5000)
    expect(estimator.left(20_000)).toBeNull()

    let short = createTimeEstimator(createPlan([1000, 1000, 1000], 1), 0)
    for (let unit of [0, 1, 2]) {
      short.end({ duration: null, unit }, (unit + 1) * 1000)
    }

    expect(short.left(3000)).toBeNull()
  })

  it('weighs units by their expected cost, not by their number', () => {
    let costs = [100, 100, 100, 100, 100, 100, 5000, 5000]
    let estimator = createTimeEstimator(createPlan(costs, 1), 0)
    for (let unit of [0, 1, 2, 3, 4, 5]) {
      estimator.end({ duration: null, unit }, (unit + 1) * 400)
    }

    expect(estimator.left(2400)).toBeCloseTo(10_000 + 2 * 300, 6)
  })

  it('takes the wall time beyond the durations as a cost per unit', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 9 }, () => 100),
        1,
      ),
      0,
    )
    for (let unit of [0, 1, 2, 3, 4]) {
      estimator.end({ duration: 100, unit }, (unit + 1) * 500)
    }

    expect(estimator.left(2500)).toBeCloseTo(4 * 500, 6)
  })

  it('counts waiting for a serial chain where it happens, not for every unit', () => {
    let estimator = createTimeEstimator(
      {
        costs: [3000, 3000, 3000, 100, 100, 100, 100, 100, 100],
        chains: [0, 0, 0, 1, 2, 3, 4, 5, 6],
        workers: 2,
      },
      0,
    )
    for (let unit of [3, 4, 5, 6, 7, 8]) {
      estimator.end({ duration: null, unit }, (unit - 2) * 100)
    }
    estimator.end({ duration: null, unit: 0 }, 3000)

    expect(estimator.left(3000)).toBe(6000)
  })

  it('runs one serial chain on one worker, whatever the workers', () => {
    let estimator = createTimeEstimator(
      {
        costs: Array.from({ length: 10 }, () => 1000),
        chains: Array.from({ length: 10 }, () => 0),
        workers: 8,
      },
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: 1000, unit }, (unit + 1) * 1000)
    }

    expect(estimator.left(3000)).toBe(7000)
  })

  it('runs two serial chains on two workers out of many', () => {
    let estimator = createTimeEstimator(
      {
        costs: Array.from({ length: 10 }, () => 1000),
        chains: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
        workers: 8,
      },
      0,
    )
    for (let [unit, time] of [
      [0, 1000],
      [5, 1000],
      [1, 2000],
      [6, 2000],
      [2, 3000],
    ] as const) {
      estimator.end({ duration: null, unit }, time)
    }

    // The unit of the second chain started with the one that ended counts as
    // half done.
    expect(estimator.left(3000)).toBeCloseTo(2000 + (3 * 500) / 5.5, 6)
  })

  it('leaves the workers idle once the last long chain is alone', () => {
    let estimator = createTimeEstimator(
      {
        costs: [2000, 2000, 2000, 2000, 1000, 1000, 1000, 1000, 1000, 1000],
        chains: [0, 0, 0, 0, 1, 2, 3, 4, 5, 6],
        workers: 4,
      },
      0,
    )
    for (let [unit, time] of [
      [4, 1000],
      [5, 1000],
      [6, 1000],
      [0, 2000],
      [7, 2000],
      [8, 2000],
      [9, 2000],
      [1, 4000],
    ] as const) {
      estimator.end({ duration: null, unit }, time)
    }

    expect(estimator.left(4000)).toBe(4000)
  })

  it('counts no more than one unit run for a chain that waited for a worker', () => {
    let estimator = createTimeEstimator(
      {
        costs: [
          ...Array.from({ length: 8 }, () => 30_000),
          500,
          ...Array.from({ length: 10 }, () => 1000),
        ],
        chains: [
          ...Array.from({ length: 9 }, (_chain, index) => index),
          ...Array.from({ length: 10 }, () => 9),
        ],
        workers: 8,
      },
      0,
    )
    for (let unit of [0, 1, 2, 3, 4, 5, 6, 7]) {
      estimator.end({ duration: 30_000, unit }, 30_000)
    }
    estimator.end({ duration: 500, unit: 8 }, 30_500)

    expect(estimator.left(30_500)).toBe(9500)
  })

  it('shrinks every time when the run went faster than expected', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 6 }, () => 1000),
        1,
      ),
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: null, unit }, (unit + 1) * 500)
    }

    expect(estimator.left(2000)).toBe(1000)
  })

  it('learns from reported durations that expensive units end early', () => {
    let costs = [1000, 3000, 1000, 3000, 1000, 3000, 1000, 3000]
    let estimator = createTimeEstimator(createPlan(costs, 1), 0)
    let now = 0
    for (let unit of [0, 1, 2, 3]) {
      let duration = costs[unit]! / 2 + 100
      now += duration
      estimator.end({ duration, unit }, now)
    }

    expect(estimator.left(now)).toBeCloseTo(4 * 100 + 4000, 6)
  })

  it('takes reported durations as proportional to costs that never differ', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 6 }, () => 1000),
        1,
      ),
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: 1500, unit }, (unit + 1) * 1500)
    }

    expect(estimator.left(4500)).toBe(4500)
  })

  it('takes reported durations as overhead when the units cost nothing', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 6 }, () => 0),
        1,
      ),
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: 1000, unit }, (unit + 1) * 1000)
    }

    expect(estimator.left(3000)).toBe(3000)

    let instant = createTimeEstimator(createPlan([0, 0, 0, 0], 1), 0)
    for (let unit of [0, 1, 2]) {
      instant.end({ duration: null, unit }, 0)
    }

    expect(instant.left(2000)).toBeNull()
  })

  it('keeps how long units run per millisecond of their cost sane', () => {
    let costs = [100, 100, 100, 1000]
    let slow = createTimeEstimator(createPlan(costs, 1), 0)
    let fast = createTimeEstimator(createPlan(costs, 1), 0)
    for (let unit of [0, 1, 2]) {
      slow.end({ duration: 5000, unit }, (unit + 1) * 5000)
      fast.end({ duration: 0, unit }, (unit + 1) * 1000)
    }

    expect(slow.left(15_000)).toBe(3000 + 20 * 1000)
    expect(fast.left(3000)).toBeCloseTo(
      (3000 - 0.05 * 300) / 3 + 0.05 * 1000,
      6,
    )
  })

  it('takes the units not ended in whatever order the runner takes them', () => {
    let estimator = createTimeEstimator(
      {
        costs: [
          10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 1000, 1000, 1000,
          1000, 1000, 1000,
        ],
        chains: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
        workers: 1,
      },
      0,
    )
    let now = 0
    for (let unit of [0, 6, 1, 7, 2, 8]) {
      now += unit < 6 ? 10_000 : 1000
      estimator.end({ duration: null, unit }, now)
    }

    expect(estimator.left(now)).toBe(33_000)
  })

  it('starts at the first estimate and moves towards new ones over wall time', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 6 }, () => 1000),
        1,
      ),
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: null, unit }, (unit + 1) * 1000)
    }

    expect(estimator.left(3000)).toBe(3000)

    estimator.end({ duration: null, unit: 3 }, 10_000)
    let jump = 10_000 + 2 * 2500
    let kept = 6000 + (jump - 6000) * (1 - Math.exp(-7000 / 10_000))

    expect(estimator.left(10_000)).toBeCloseTo(kept - 10_000, 6)

    let settled = jump + (kept - jump) * Math.exp(-500 / 10_000)

    expect(estimator.left(10_500)).toBeCloseTo(settled - 10_500, 6)
    expect(estimator.left(15_000)).toBeNull()
  })

  it('estimates again at most four times a second', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 6 }, () => 1000),
        1,
      ),
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: null, unit }, (unit + 1) * 1000)
    }

    expect(estimator.left(3000)).toBe(3000)

    estimator.end({ duration: null, unit: 3 }, 3100)

    expect(estimator.left(3200)).toBe(2800)

    let end = 3100 + (2000 * 3100) / 4000
    expect(estimator.left(3300)).toBeCloseTo(
      end + (6000 - end) * Math.exp(-100 / 10_000) - 3300,
      6,
    )
  })

  it('counts unknown and repeated units as the first ones not finished', () => {
    let estimator = createTimeEstimator(
      createPlan([1000, 1000, 9000, 9000], 1),
      0,
    )
    estimator.end({ duration: null, unit: 1 }, 1000)
    estimator.end({ duration: null, unit: 1 }, 2000)
    estimator.end({ duration: null, unit: null }, 3000)

    expect(estimator.left(3000)).toBeCloseTo(9000 * (3000 / 11_000), 6)

    estimator.end({ duration: null, unit: null }, 4000)
    estimator.end({ duration: null, unit: null }, 5000)

    expect(estimator.left(5000)).toBeNull()
  })

  it('needs no workers to tell the time left', () => {
    let estimator = createTimeEstimator(
      createPlan(
        Array.from({ length: 4 }, () => 1000),
        0,
      ),
      0,
    )
    for (let unit of [0, 1, 2]) {
      estimator.end({ duration: null, unit }, (unit + 1) * 1000)
    }

    expect(estimator.left(3000)).toBe(1000)
  })
})
