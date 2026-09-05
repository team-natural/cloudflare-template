<script lang="ts">
  // TEMPORARY: placeholder island to verify the Svelte-in-Astro wiring for apps/admin.
  // Replaced by the real login form once shadcn-svelte is added.
  let count = $state(0);
</script>

<button type="button" class="rounded border px-3 py-1 text-sm" onclick={() => count++}>
  カウント: {count}
</button>
