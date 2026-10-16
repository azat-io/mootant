<script>
export default {
  props: { label: { type: String, required: true } },
  computed: {
    text() {
      return this.label.length > 3 ? this.label.slice(0, 3) : this.label
    },
  },
}
</script>

<template>
  <span>{{ text }}</span>
</template>
