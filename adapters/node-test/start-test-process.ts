import type { ChildProcess } from 'node:child_process'

import { spawn } from 'node:child_process'

import { trackProcessGroup } from '../shared/track-process-group'

/**
 * Starts a test process detached, as the leader of a process group of its own,
 * without stdin. Until the process ends or fails to start, mootant stops its
 * group when it exits or gets SIGINT or SIGTERM (`trackProcessGroup`), and the
 * session holds the group in `groups`, which it stops when it closes. With a
 * pipe, the process gets file descriptor 3 too, through which mootant sends its
 * unit.
 *
 * @param options - Binary, arguments, environment, working directory, where the
 *   output goes, the session's groups and whether the unit comes through a
 *   pipe.
 * @param options.output - `pipe` to read stdout and stderr, else `ignore`.
 * @param options.groups - Process groups of the session's test processes.
 * @param options.env - Environment variables of the process.
 * @param options.args - Arguments after the Node binary.
 * @param options.pipe - Whether the process gets file descriptor 3.
 * @param options.node - Node binary.
 * @param options.cwd - Working directory of the process.
 * @returns The child process, which may still be starting.
 */
export function startTestProcess(options: {
  output: 'ignore' | 'pipe'
  env: NodeJS.ProcessEnv
  groups: Set<number>
  args: string[]
  pipe: boolean
  node: string
  cwd: string
}): ChildProcess {
  let { output, groups } = options
  let stdio: ('ignore' | 'pipe')[] = ['ignore', output, output]
  if (options.pipe) {
    stdio.push('pipe')
  }
  let child = spawn(options.node, options.args, {
    windowsHide: true,
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio,
  })
  let { pid } = child
  if (pid !== undefined) {
    let untrack = trackProcessGroup(pid)
    groups.add(pid)
    /**
     * Forgets the group once the process ended.
     */
    function release(): void {
      untrack()
      groups.delete(pid!)
    }
    child.once('exit', release)
    child.once('error', release)
  }
  return child
}
