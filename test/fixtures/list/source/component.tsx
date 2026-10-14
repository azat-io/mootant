// JSX attribute strings are never mutated; a JSX element is an object, so each && below is in value mode.
export function List({ items, active, status }: { items: string[]; active: boolean; status: string }) {
  return (
    <ul className={active ? 'on' : ''} title="Items">
      {items.length > 0 && <Item />}
      {status === 'busy' && <Spinner />}
    </ul>
  )
}
