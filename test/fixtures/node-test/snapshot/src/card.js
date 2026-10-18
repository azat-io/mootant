export function renderCard(user) {
  let role = user.admin ? 'admin' : 'member'
  return { title: user.name.toUpperCase(), role }
}
