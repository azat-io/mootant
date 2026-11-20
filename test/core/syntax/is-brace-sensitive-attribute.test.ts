import { describe, expect, it } from 'vitest'

import { isBraceSensitiveAttribute } from '../../../core/syntax/is-brace-sensitive-attribute'
import { createTestFile } from '../../helpers/create-test-file'

describe('isBraceSensitiveAttribute', () => {
  it.each([
    {
      source: 'x = <button disabled="disabled" />',
      text: 'disabled="disabled"',
    },
    { source: 'x = <input value="x" />', text: 'value="x"' },
    { source: 'x = <input readOnly="" />', text: 'readOnly=""' },
    { source: 'x = <input readonly="" />', text: 'readonly=""' },
    { source: 'x = <video autoPlay="" />', text: 'autoPlay=""' },
    { source: 'x = <my-input label="x" />', text: 'label="x"' },
    { source: 'x = <my-input xlink:href="#a" />', text: 'xlink:href="#a"' },
    { source: 'x = <button is="fancy-button" title="x" />', text: 'title="x"' },
    { source: 'x = <button bool:disabled="0" />', text: 'bool:disabled="0"' },
    { source: 'x = <Button bool:disabled="0" />', text: 'bool:disabled="0"' },
    { source: 'x = <input prop:value="x" />', text: 'prop:value="x"' },
    { source: 'x = <a attr:title="x" />', text: 'attr:title="x"' },
    { source: 'x = <a on:click="x" />', text: 'on:click="x"' },
    { source: 'x = <button onclick="save()" />', text: 'onclick="save()"' },
    { source: 'x = <Button onClick="save" />', text: 'onClick="save"' },
    { source: 'x = <a one="x" />', text: 'one="x"' },
    { source: 'x = <input ref="field" />', text: 'ref="field"' },
    { source: 'x = <Field ref="field" />', text: 'ref="field"' },
    { source: 'x = <b children="x" />', text: 'children="x"' },
    { source: 'x = <b classList="a" />', text: 'classList="a"' },
    { source: 'x = <b class="a  b" />', text: 'class="a  b"' },
    { source: 'x = <b className="a" />', text: 'className="a"' },
    { source: 'x = <b style="color: red" />', text: 'style="color: red"' },
    { source: 'x = <b innerHTML="x" />', text: 'innerHTML="x"' },
    { source: 'x = <b innerText="x" />', text: 'innerText="x"' },
    { source: 'x = <b textContent="x" />', text: 'textContent="x"' },
  ])('tells that braces may change $text in $source', ({ source, text }) => {
    let { find } = createTestFile(source, 'example.tsx')

    expect(
      isBraceSensitiveAttribute(
        find('JSXAttribute', text),
        find('JSXOpeningElement'),
      ),
    ).toBe(true)
  })

  it.each([
    { source: 'x = <input type="password" />', text: 'type="password"' },
    { source: 'x = <use xlink:href="#a" />', text: 'xlink:href="#a"' },
    { source: 'x = <a href="/home" />', text: 'href="/home"' },
    {
      source: 'x = <Button disabled="disabled" />',
      text: 'disabled="disabled"',
    },
    { source: 'x = <Form.Input value="x" />', text: 'value="x"' },
  ])('tells that braces keep $text in $source', ({ source, text }) => {
    let { find } = createTestFile(source, 'example.tsx')

    expect(
      isBraceSensitiveAttribute(
        find('JSXAttribute', text),
        find('JSXOpeningElement'),
      ),
    ).toBe(false)
  })
})
