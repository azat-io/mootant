<script setup lang="ts">
import { ref } from 'vue'

let props = defineProps<{ items: string[] }>()
let count = ref(0)

function add(step: number): void {
  count.value += step
}
</script>

<template>
  <section :title='count > 2 ? "busy" : "idle"'>
    <p v-if="count >= 3">{{ count * 2 }}</p>
    <p v-else>{{ props.items.length - count }}</p>
    <ul>
      <li v-for="item in props.items.filter(item => item !== 'skip')">
        {{ item.toUpperCase() }}
      </li>
    </ul>
    <button class="one" @click="count++">+</button>
    <button class="two" @click="add(2); count--">++</button>
  </section>
</template>
