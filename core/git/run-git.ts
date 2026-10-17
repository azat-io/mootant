import { execFile } from 'node:child_process'

/**
 * Most bytes git may print, so the diff of a large change still fits.
 */
const MAX_BUFFER = 256 * 1024 * 1024

/**
 * What a git command printed and how it exited.
 */
interface GitOutput {
  /**
   * Standard error, for messages.
   */
  stderr: string

  /**
   * Standard output.
   */
  stdout: string

  /**
   * Exit code; 0 on success.
   */
  code: number
}

/**
 * Runs a git command without a shell. Paths are printed as they are
 * (`core.quotePath=false`), messages are in English (`LC_ALL=C`), so they can
 * be told apart, and git takes no optional locks, so a run never blocks the
 * user's own git commands.
 *
 * @param gitArguments - Arguments after `git`.
 * @param cwd - Directory to run git in.
 * @returns Output and exit code; a failing command resolves too.
 * @throws Error - When git is not installed or cannot run.
 */
export function runGit(
  gitArguments: string[],
  cwd: string,
): Promise<GitOutput> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'core.quotePath=false', ...gitArguments],
      {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
        maxBuffer: MAX_BUFFER,
        encoding: 'utf8',
        cwd,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr })
        } else if (typeof error.code === 'number') {
          resolve({ code: error.code, stdout, stderr })
        } else if (error.code === 'ENOENT') {
          reject(new Error('--since needs git, and it was not found.'))
        } else {
          reject(
            new Error(`git could not run: ${error.message}`, { cause: error }),
          )
        }
      },
    )
  })
}
