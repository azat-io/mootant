import { expect, it, vi } from 'vitest'

import type { Logger } from '../src/report'

import {
  introduce,
  announce,
  record,
  report,
  finish,
  notify,
  build,
  close,
  dump,
  hide,
  warn,
} from '../src/report'

it('reports the count', () => {
  let info = vi.spyOn(console, 'info').mockImplementation(() => {})
  report(2)
  expect(info).toHaveBeenCalledWith('found 2 entries')
  info.mockRestore()
})

it('warns without checking the message', () => {
  expect(warn('cache')).toBe(5)
})

it('fails to introduce nobody', () => {
  expect(() => introduce(null as unknown as { name: string })).toThrow(
    TypeError,
  )
})

it('fails to notify without a context', () => {
  expect(() => notify(null as unknown as { logger: never })).toThrow(TypeError)
})

it('finishes without a logger', () => {
  expect(finish()).toBe('finished')
})

it('fails to dump a bigint as JSON', () => {
  expect(() => {
    dump({ id: 1n })
  }).toThrow(TypeError)
  expect(() => {
    hide({ id: 1n })
  }).toThrow(TypeError)
})

it('closes without checking the output', () => {
  expect(close()).toBeUndefined()
})

it('builds the entries a local log function keeps', () => {
  expect(build()).toStrictEqual(['built'])
})

it('fails to announce without a logger', () => {
  expect(() => announce(null as unknown as Logger)).toThrow(TypeError)
})

it('records into a console it is given', () => {
  let lines: string[] = []
  record({ info: line => lines.push(line) })
  expect(lines).toStrictEqual(['kept'])
})
