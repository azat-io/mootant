#!/usr/bin/env node
// mootant-ignore-file string-literal: messages are checked by snapshot tests
'use strict'

const path = require('node:path')

function count(list, start = 0) {
  var n = start
  for (var key in list) n += key.length
  return n
}

function hoisted() {
  setTimeout(() => print(base + 1))
  var base = 10
}

console.log('total %d', count([]) * 2)

const greeting = 'hello'

const render = (items) => <ul title="list">{items.length > 0 && <li>{path.join('a', 'b')}</li>}</ul>

module.exports = { count, render, greeting }
