import { render } from 'svelte/server'
import { expect, it } from 'vitest'

import Greeting from '../src/greeting.svelte'

it('greets loudly', () => {
  let { body } = render(Greeting, { props: { name: 'ada', loud: true } })

  expect(body).toContain('<p>ADA!</p>')
})
