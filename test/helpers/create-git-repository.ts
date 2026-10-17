import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Temporary git repository of a test.
 */
export interface GitRepository {
  /**
   * Writes a file, creating its directories.
   *
   * @param file - Path relative to the repository.
   * @param text - Text of the file.
   * @returns Promise of the write.
   */
  write(file: string, text: string): Promise<void>

  /**
   * Runs git in the repository as a fixed author, without signing.
   *
   * @param gitArguments - Arguments after `git`.
   * @returns Standard output.
   */
  git(...gitArguments: string[]): string

  /**
   * Removes the repository.
   *
   * @returns Promise of the removal.
   */
  remove(): Promise<void>

  /**
   * Real path of the repository.
   */
  root: string
}

/**
 * Creates an empty git repository on branch `main` in a temporary directory.
 *
 * @returns The repository, with helpers to write files and run git.
 */
export async function createGitRepository(): Promise<GitRepository> {
  let root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-git-')))
  /**
   * Runs git in the repository.
   *
   * @param gitArguments - Arguments after `git`.
   * @returns Standard output.
   */
  function git(...gitArguments: string[]): string {
    return execFileSync(
      'git',
      [
        '-c',
        'user.name=Mootant',
        '-c',
        'user.email=mootant@example.com',
        '-c',
        'commit.gpgSign=false',
        ...gitArguments,
      ],
      { encoding: 'utf8', cwd: root },
    )
  }
  git('init', '--quiet', '--initial-branch=main')
  return {
    async write(file, text) {
      let absolute = path.join(root, file)
      await mkdir(path.dirname(absolute), { recursive: true })
      await writeFile(absolute, text)
    },
    remove: () => rm(root, { recursive: true, force: true }),
    root,
    git,
  }
}
