import { expect, it } from 'vitest'

import { AppError, findUser, statusOf } from '../src/errors.js'

it('finds a user', () => {
  let user = { name: 'Ann' }
  expect(findUser(new Map([[1, user]]), 1)).toBe(user)
})

it('throws for a missing user', () => {
  expect(() => findUser(new Map(), 2)).toThrow(AppError)
})

it('maps the codes to statuses', () => {
  expect(statusOf({ code: 'NOT_FOUND' })).toBe(404)
  expect(statusOf({ code: 'OTHER' })).toBe(500)
})

it('keeps the code', () => {
  expect(new AppError('X', 'message').code).toBe('X')
})
