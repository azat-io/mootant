export function Login({ onSubmit }) {
  return (
    <form method="post" onSubmit={onSubmit}>
      <input type="password" name="password" aria-label="Password" />
      <button type="submit">Sign in</button>
    </form>
  )
}
