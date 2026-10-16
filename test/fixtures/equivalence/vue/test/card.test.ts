// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { expect, it } from 'vitest'

import Card from '../src/card.vue'

/**
 * Mounts the card into a new element.
 *
 * @returns The element the card renders into.
 */
function mount(): HTMLElement {
  let root = document.createElement('div')
  createApp(Card, { items: ['a', 'skip', 'b'] }).mount(root)
  return root
}

it('lists the items without the skipped one', () => {
  let root = mount()

  expect(root.querySelector('section')!.title).toBe('idle')
  expect(root.querySelector('p')!.textContent).toBe('3')
  expect(
    [...root.querySelectorAll('li')].map(item => item.textContent!.trim()),
  ).toStrictEqual(['A', 'B'])
})

it('counts clicks', async () => {
  let root = mount()
  for (let click = 0; click < 3; click++) {
    root.querySelector<HTMLButtonElement>('.one')!.click()
  }
  await nextTick()

  expect(root.querySelector('p')!.textContent).toBe('6')
  expect(root.querySelector('section')!.title).toBe('busy')
})

it('adds one with the second button', async () => {
  let root = mount()
  root.querySelector<HTMLButtonElement>('.two')!.click()
  await nextTick()

  expect(root.querySelector('p')!.textContent).toBe('2')
})
