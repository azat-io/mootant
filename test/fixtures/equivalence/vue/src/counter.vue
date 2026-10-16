<script setup lang="ts">
import { computed } from 'vue'

let props = withDefaults(defineProps<{ count: number; step?: number }>(), {
  step: 1,
})

let emit = defineEmits(['limit'])

let next = computed(() => {
  let value = props.count + props.step
  if (value > 9) {
    emit('limit', value)
  }
  return value
})

defineExpose({ next })
</script>

<template>
  <output>{{ next }}</output>
</template>
