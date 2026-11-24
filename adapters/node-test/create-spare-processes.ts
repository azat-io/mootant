import type { ChildProcess } from 'node:child_process'
import type { Writable } from 'node:stream'

import type { NodeTestHandle } from './types/node-test-handle'
import type { SpareProcesses } from './types/spare-processes'

import { stopProcessGroup } from '../shared/stop-process-group'
import { startTestProcess } from './start-test-process'

/**
 * Creates the spare test processes of the jobs of a pool (`runInPool`). A spare
 * runs what the process of a job of its test file runs (`runTestFile`): `node`,
 * the session's flags and the test file, in the project root, with the
 * session's variables and file descriptor 3, but mootant's preload, which runs
 * before any module of the project, waits there for the unit (`readUnit`). So
 * the job that takes a spare skips the start of a process. Each time a job
 * starts, it takes a spare of its test file if one is alive, unless it must
 * start a new process. The spares then follow the jobs that wait first, one per
 * key, as the pool never runs two jobs with one key at once: a spare none of
 * them needs stops, and those they lack start, up to the most spares of the
 * session at once (`NodeTestHandle.spares`); with none, no spare starts. A
 * spare that ended or could not start is dropped.
 *
 * @param handle - Live session.
 * @param jobs - Real absolute path of the test file and key of each job, in the
 *   order of the pool.
 * @returns The spares of the jobs.
 */
export function createSpareProcesses(
  handle: NodeTestHandle,
  jobs: readonly { file: string; key: string }[],
): SpareProcesses {
  let { context } = handle
  let spares = new Map<string, ChildProcess[]>()
  let started = new Set<number>()
  let alive = 0
  let first = 0
  /**
   * Starts a spare of a test file.
   *
   * @param file - Real absolute path of the test file.
   */
  function start(file: string): void {
    let spare = startTestProcess({
      output: context.onOutput === undefined ? 'ignore' : 'pipe',
      env: { ...handle.env, MOOTANT_UNIT_FD: '3' },
      args: [...handle.args, file],
      groups: handle.groups,
      node: handle.node,
      cwd: context.root,
      pipe: true,
    })
    spares.set(file, [...(spares.get(file) ?? []), spare])
    alive += 1
    /**
     * Drops the spare once it ended or could not start, unless a job took it.
     */
    function drop(): void {
      let list = spares.get(file)!
      if (list.includes(spare)) {
        spares.set(
          file,
          list.filter(entry => entry !== spare),
        )
        alive -= 1
      }
    }
    spare.on('error', drop)
    spare.on('exit', drop)
    if (spare.pid !== undefined) {
      let pipe = spare.stdio[3] as Writable | null
      pipe?.on('error', () => {})
    }
  }
  /**
   * Stops the spares that the first waiting jobs, one per key, do not need, and
   * starts those they lack.
   */
  function fill(): void {
    while (started.has(first)) {
      first += 1
    }
    let keys = new Set<string>()
    let needed = new Map<string, number>()
    for (
      let index = first;
      index < jobs.length && keys.size < handle.spares;
      index += 1
    ) {
      let job = jobs[index]!
      if (!started.has(index) && !keys.has(job.key)) {
        keys.add(job.key)
        needed.set(job.file, (needed.get(job.file) ?? 0) + 1)
      }
    }
    for (let [file, list] of spares) {
      let unused = list.splice(needed.get(file) ?? 0)
      alive -= unused.length
      stopAll(unused)
    }
    for (let [file, count] of needed) {
      for (
        let have = spares.get(file)?.length ?? 0;
        have < count && alive < handle.spares;
        have += 1
      ) {
        start(file)
      }
    }
  }
  return {
    take: (index, fresh) => {
      started.add(index)
      let { file } = jobs[index]!
      let [spare = null, ...rest] = fresh ? [] : (spares.get(file) ?? [])
      if (spare !== null) {
        spares.set(file, rest)
        alive -= 1
        if (
          spare.pid === undefined ||
          spare.exitCode !== null ||
          spare.signalCode !== null
        ) {
          spare = null
        }
      }
      fill()
      return spare
    },
    stop: () => {
      for (let list of spares.values()) {
        stopAll(list)
      }
    },
  }
}

/**
 * Stops spare processes.
 *
 * @param list - The spares.
 */
function stopAll(list: readonly ChildProcess[]): void {
  for (let { pid } of list) {
    if (pid !== undefined) {
      stopProcessGroup(pid)
    }
  }
}
