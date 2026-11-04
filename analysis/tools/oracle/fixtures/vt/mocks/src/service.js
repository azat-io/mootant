import { fetchUser, isAdmin } from './api.js'

export async function greet(id) {
  let user = await fetchUser(id)
  return isAdmin(user) ? `Welcome back, ${user.name}!` : `Hello, ${user.name}!`
}
