// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { expect, it } from 'vitest'

import Save from '../src/save.vue'

/**
 * Mounts the buttons into a new element and collects the errors the app
 * handles.
 *
 * @returns The element the buttons render into and the handled errors.
 */
function mount(): { errors: unknown[]; root: HTMLElement } {
  let root = document.createElement('div')
  let errors: unknown[] = []
  let app = createApp(Save)
  app.config.errorHandler = error => {
    errors.push(error)
  }
  app.mount(root)
  return { errors, root }
}

it('sends a failed save to the error handler', async () => {
  let { errors, root } = mount()
  root.querySelector<HTMLButtonElement>('.save')!.click()
  await new Promise(resolve => {
    setTimeout(resolve, 0)
  })

  expect(errors).toStrictEqual([new Error('Cannot save 0')])
})

it('counts down', async () => {
  let { root } = mount()
  let down = root.querySelector<HTMLButtonElement>('.down')!
  down.click()
  await nextTick()

  expect(down.textContent).toBe('-1')

  down.click()
  await nextTick()

  expect(down.textContent).toBe('-2')
})
