export function open(user, door, log) {
  if (user.isAdmin) {
    door.open(user)
  }
  let count = 0
  for (let entry of log) {
    count++
    entry.seen = true
  }
  return count
}
