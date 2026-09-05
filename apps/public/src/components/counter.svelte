<script lang="ts">
  // TEMPLATE: placeholder island showing the Svelte-in-Astro pattern for the public
  // site (DEV-06 §1 — islands live in apps/public/src/components/ and are embedded
  // with client:*). Replace this with the real interactive parts of the public site.
  let count = $state(0);
</script>

<button type="button" class="rounded border px-3 py-1 text-sm" onclick={() => count++}>
  カウント: {count}
</button>
