<script context="module">
  export const STEP = 2
</script>

<script>
  export let value = 0

  function bump() {
    // mootant-ignore-next-line
    value += STEP
    notify(value)
  }
</script>

<button on:click={bump}>{value * 2}</button>
<button on:click={() => value++}>+</button>
