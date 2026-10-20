<script setup lang="ts">
// the template writes cursor, which may go below -1: `cursor <= -1` is kept
let cursor = 'a:b'.indexOf(':')

function state(): string {
  return cursor === -1 ? 'none' : 'some'
}
</script>

<template>
  <button @click="cursor = -5">reset</button>
  <p>{{ state() }}</p>
</template>
