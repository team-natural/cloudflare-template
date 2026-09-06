<script lang="ts">
  // Plain markup, not shadcn: shadcn-svelte is admin-only, and a public site's design is
  // rebuilt per project anyway. This is the working skeleton to restyle.
  import { onMount } from "svelte";

  const LANDING_ROUTE = "/mypage";

  const id = $props.id();

  let email = $state("");
  let password = $state("");
  let submitting = $state(false);
  // The island renders before its JS runs, and a submit in that window is a native POST that
  // silently loses the input.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
  let fieldErrors = $state<Record<string, string[] | undefined>>({});
  let formError = $state("");

  // The API answers in Japanese; mapping by status keeps this screen in one language. None of
  // these distinguish "no such account" from "wrong password".
  function messageFor(status: number) {
    if (status === 401) return "Incorrect email or password.";
    if (status === 429) return "Too many attempts. Please wait and try again.";
    return "Login failed. Please try again later.";
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;

    submitting = true;
    fieldErrors = {};
    formError = "";

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        // replace() so Back doesn't return to an already-authenticated login form.
        window.location.replace(LANDING_ROUTE);
        return;
      }

      const body = (await response.json().catch(() => null)) as { errors?: Record<string, string[] | undefined> } | null;
      if (response.status === 422 && body?.errors) {
        fieldErrors = body.errors;
      } else {
        formError = messageFor(response.status);
      }
    } catch {
      formError = "Could not reach the server. Check your connection.";
    } finally {
      // Unreached on success (navigating away) — re-enabling first would allow a double submit.
      submitting = false;
    }
  }
</script>

<form class="flex w-full max-w-sm flex-col gap-4" onsubmit={handleSubmit}>
  {#if formError}
    <p role="alert" class="rounded border border-red-500 px-3 py-2 text-sm text-red-700">{formError}</p>
  {/if}

  <div class="flex flex-col gap-1">
    <label for="email-{id}">Email</label>
    <input id="email-{id}" class="rounded border px-3 py-2" type="email" autocomplete="username" bind:value={email} required aria-invalid={fieldErrors.email ? "true" : undefined} />
    {#if fieldErrors.email}
      <p role="alert" class="text-sm text-red-700">{fieldErrors.email.join(" ")}</p>
    {/if}
  </div>

  <div class="flex flex-col gap-1">
    <label for="password-{id}">Password</label>
    <input id="password-{id}" class="rounded border px-3 py-2" type="password" autocomplete="current-password" bind:value={password} required aria-invalid={fieldErrors.password ? "true" : undefined} />
    {#if fieldErrors.password}
      <p role="alert" class="text-sm text-red-700">{fieldErrors.password.join(" ")}</p>
    {/if}
  </div>

  <button type="submit" class="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={!hydrated || submitting}>
    {submitting ? "Logging in…" : "Login"}
  </button>
</form>
