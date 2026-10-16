<script module>
  export function clampRating(value) {
    if (value > 5) {
      return 5
    }
    return value
  }
</script>

<script>
  let { rating } = $props()

  let count = $derived(clampRating(rating))
</script>

<span>{'*'.repeat(count)}</span>
