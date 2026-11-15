import { fetchUser } from './api'

export async function greet(id: number): Promise<string> {
  let user = await fetchUser(id)
  return `Hello, ${user.name}!`
}
