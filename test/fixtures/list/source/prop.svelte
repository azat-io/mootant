<script lang="ts">
  export let items: string[] = []
  // a prop, which the parent may set below -1: `at <= -1` is kept
  export let at = items.indexOf('x')

  $: label = at === -1 ? 'missing' : 'found'
</script>

<p>{label}</p>
