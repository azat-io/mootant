<script setup lang="ts">
let open = defineModel('open', { default: false })

let label = open.value ? 'close' : 'open'
</script>

<template>
  <button>{{ label }}</button>
</template>
