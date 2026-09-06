<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { FieldGroup, Field, FieldLabel, FieldError } from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  // `/` is the login screen itself, so success must land elsewhere or it loops. A constant,
  // not a `?next=` parameter — that would be an open redirect.
  const LANDING_ROUTE = "/dashboard";

  const id = $props.id();

  let email = $state("");
  let password = $state("");
  let submitting = $state(false);
  // The island renders before its JS runs, and a submit in that window is a native POST to `/`
  // that silently loses the input.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
  let fieldErrors = $state<Record<string, string[] | undefined>>({});
  let formError = $state("");

  const toFieldError = (messages: string[] | undefined) => messages?.map((message) => ({ message }));

  // The API answers in Japanese; mapping by status keeps this screen in one language. None of
  // these distinguish "no such account" from "wrong password" — the 401 text must stay generic.
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

<Card.Root class="mx-auto w-full max-w-sm">
  <Card.Header>
    <Card.Title class="text-2xl">Login</Card.Title>
    <Card.Description>Enter your email below to login to your account</Card.Description>
  </Card.Header>
  <Card.Content>
    <form onsubmit={handleSubmit}>
      <FieldGroup>
        {#if formError}
          <FieldError>{formError}</FieldError>
        {/if}
        <Field>
          <FieldLabel for="email-{id}">Email</FieldLabel>
          <Input id="email-{id}" name="email" type="email" autocomplete="username" placeholder="m@example.com" bind:value={email} required aria-invalid={fieldErrors.email ? "true" : undefined} />
          <FieldError errors={toFieldError(fieldErrors.email)} />
        </Field>
        <Field>
          <FieldLabel for="password-{id}">Password</FieldLabel>
          <Input id="password-{id}" name="password" type="password" autocomplete="current-password" bind:value={password} required aria-invalid={fieldErrors.password ? "true" : undefined} />
          <FieldError errors={toFieldError(fieldErrors.password)} />
        </Field>
        <Field>
          <Button type="submit" class="w-full" disabled={!hydrated || submitting}>
            {submitting ? "Logging in…" : "Login"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  </Card.Content>
</Card.Root>
