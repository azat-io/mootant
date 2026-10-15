/**
 * Tells whether a worker process may still run. An empty text is a claim whose
 * process id is being written, so its worker is alive; a process this one may
 * not signal is alive too.
 *
 * @param text - Process id as written in a claim or worker file.
 * @returns Whether the process is alive or not known yet.
 */
export function isProcessAlive(text: string): boolean {
  if (text === '') {
    return true
  }
  try {
    process.kill(Number(text), 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
