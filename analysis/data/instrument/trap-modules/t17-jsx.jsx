/** @jsx h */
/** @jsxFrag Fragment */
function h(type, props, ...children) {
  return { type: typeof type === 'function' ? type.name : type, props: props ?? {}, children: children.flat() }
}
function Fragment() {}
function Item({ label, count }) {
  return <li data-count={count + 1}>{label.toUpperCase()}{count > 1 && <b>!</b>}</li>
}
export function probe() {
  let items = [{ label: 'a', count: 1 }, { label: 'b', count: 2 }]
  let extra = { title: 'x' + 1 }
  let tree = (
    <>
      <ul {...extra} class={items.length > 1 ? 'many' : 'one'}>
        {items.map((item, index) => <Item key={index + 1} {...item} />)}
      </ul>
      {items.length === 0 ? <p>empty</p> : null}
    </>
  )
  let expand = node => typeof node === 'object' && node !== null && typeof node.type === 'string' && node.type === 'Item' ? node : node
  return { tree: JSON.parse(JSON.stringify(tree, (key, value) => typeof value === 'function' ? value.name : value)), $expand: typeof expand }
}
