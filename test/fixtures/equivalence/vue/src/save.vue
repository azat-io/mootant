<script setup lang="ts">
import { ref } from 'vue'

let ready = ref(true)
let count = ref(0)

async function save(): Promise<void> {
  throw new Error(`Cannot save ${count.value}`)
}

function log(): void {}
</script>

<template>
  <button class="save" @click="ready && save()">Save</button>
  <button class="down" @click.stop="function () { log()
    count > 0 ? (count -= 2) : (count -= 1) }">{{ count }}</button>
</template>
