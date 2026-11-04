export async function fetchUser(id) {
  return { id, name: `user${id}` }
}

export function isAdmin(user) {
  return user.id === 1
}
