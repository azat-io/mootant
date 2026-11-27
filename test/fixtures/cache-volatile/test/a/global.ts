import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

export default async function setup({
  provide,
}: {
  provide: (key: string, value: string) => void
}): Promise<() => Promise<void>> {
  let server = createServer((_request, response) => {
    response.end('ok')
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  let { port } = server.address() as { port: number }
  provide('apiUrl', `http://127.0.0.1:${port}/?run=${randomUUID()}`)
  return () =>
    new Promise<void>(resolve => {
      server.close(() => {
        resolve()
      })
    })
}
