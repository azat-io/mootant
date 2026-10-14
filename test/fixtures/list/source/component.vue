<template>
  <p :title="label">{{ label + '!' }}</p>
</template>

<script lang="ts">
export default { name: 'Greeting' }
</script>

<script setup lang="ts">
let props = defineProps<{ name: string }>()
let label = props.name.trim()
// mootant-ignore-next-line string-literal: debug output
emit('ready')
</script>
