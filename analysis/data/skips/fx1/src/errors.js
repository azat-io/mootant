export class AppError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function findUser(users, id) {
  let user = users.get(id)
  if (!user) {
    throw new AppError('NOT_FOUND', `No user ${id}`)
  }
  return user
}

export function statusOf(error) {
  return error.code === 'NOT_FOUND' ? 404 : 500
}
