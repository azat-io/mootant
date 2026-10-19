import { describe, expect, it } from 'vitest'

import type { RunEvent } from '../../../types/run/run-event'

import { countVerdicts } from '../../../core/run/count-verdicts'
import { createTestRun } from '../../helpers/create-test-run'

describe('countVerdicts', () => {
  it('counts final statuses with the preview and reports them when they change', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          {
            covers: ['killed', 'timeout', 'error', 'kept'],
            file: '/t/a.test.ts',
            id: 't1',
          },
          { file: '/t/b.test.ts', covers: ['kept'], id: 't2' },
        ],
      },
      {
        mutants: ['killed', 'timeout', 'error', 'kept', 'none'],
        isolate: true,
      },
    )
    let events: RunEvent[] = []
    state.report = event => {
      events.push(event)
    }
    let verdict = { message: null, cause: null, file: null, test: null }
    state.mutants.get('killed')!.verdict = { ...verdict, status: 'Killed' }
    state.mutants.get('timeout')!.verdict = { ...verdict, status: 'Timeout' }
    state.mutants.get('error')!.verdict = { ...verdict, status: 'Error' }

    countVerdicts(state)
    countVerdicts(state)

    let kept = state.mutants.get('kept')!
    state.live!.preview.set('kept', {
      evidence: new Map(kept.ranked.map(file => [file, 'none'])),
      survived: true,
    })
    countVerdicts(state, [kept])

    state.live!.preview.clear()
    countVerdicts(state, [kept])

    expect(events).toStrictEqual([
      { kind: 'verdicts', survived: 0, timeout: 1, killed: 1, error: 1 },
      { kind: 'verdicts', survived: 1, timeout: 1, killed: 1, error: 1 },
      { kind: 'verdicts', survived: 0, timeout: 1, killed: 1, error: 1 },
    ])
    expect(state.live!.statuses.get('none')).toBe('NoCoverage')
  })
  it('counts survivors and uncovered mutants that ran outside the workers as errors', async () => {
    let { state } = await createTestRun(
      {
        tests: [{ covers: ['kept', 'killed'], file: '/t/a.test.ts', id: 't1' }],
      },
      { mutants: ['kept', 'killed', 'none'], isolate: true },
    )
    let events: RunEvent[] = []
    state.report = event => {
      events.push(event)
    }
    state.live!.outside = new Set(['killed', 'kept', 'none'])
    let verdict = { message: null, cause: null, file: null, test: null }
    state.mutants.get('killed')!.verdict = { ...verdict, status: 'Killed' }
    let kept = state.mutants.get('kept')!
    kept.survived = true
    for (let file of kept.ranked) {
      kept.evidence.set(file, 'none')
    }

    countVerdicts(state)

    expect(events).toStrictEqual([
      { kind: 'verdicts', survived: 0, timeout: 0, killed: 1, error: 2 },
    ])
  })
})
