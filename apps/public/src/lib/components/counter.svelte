<script lang="ts">
  // Placeholder island showing the Svelte-in-Astro pattern. Replace it with the real
  // interactive parts of the public site.
  let count = $state(0);
</script>

<button type="button" class="rounded border px-3 py-1 text-sm" onclick={() => count++}>
  カウント: {count}
</button>
