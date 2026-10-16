<script lang="tsx">
export function sum(values: number[]): number {
  let total = 0
  for (let value of values) {
    total += value
  }
  return total
}
</script>

<script setup lang="tsx">
let props = defineProps<{ values: number[] }>()
</script>

<template>
  <b>{{ sum(props.values) }}</b>
</template>
