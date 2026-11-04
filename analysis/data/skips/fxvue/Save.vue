<script setup>
const emit = defineEmits(['save'])
function save() {
  emit('save')
}
</script>

<template>
  <button @click="save()">Save</button>
</template>
