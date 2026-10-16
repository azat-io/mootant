<script lang="ts">
  let { name, loud = false }: { name: string; loud?: boolean } = $props()

  let text = $derived(loud ? `${name.toUpperCase()}!` : name)
</script>

<p>{text}</p>
