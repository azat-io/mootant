<script setup>
import { ref } from 'vue'

const props = defineProps({ step: Number })
const emit = defineEmits(['change'])
const count = ref(0)
function save() {
  emit('change', count.value)
}
</script>

<template>
  <button @click="count += props.step; save()">Add</button>
  <span v-if="count > 0">{{ count }}</span>
</template>
