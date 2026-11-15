export interface User {
  name: string
  id: number
}

export async function fetchUser(id: number): Promise<User> {
  return { id, name: `user${id}` }
}
