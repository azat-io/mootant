<script lang="ts">
  let { count, label = 'items' }: { count: number; label?: string } = $props()
</script>

{#if count > 0}
  <span class:many={count >= 10} title={`${count} ${label}`}>
    {count > 99 ? '99+' : count}
  </span>
{:else}
  <em>{label.toUpperCase()}</em>
{/if}
{#each [1, 2] as step (step)}<i>{step * count}</i>{/each}
