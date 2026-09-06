<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { FieldError } from "$lib/components/ui/field/index.js";

  // POST, not a link: logout deletes the admin_sessions row, and a GET that mutates state
  // would be triggerable by any <img> pointed at it.
  let submitting = $state(false);
  let error = $state("");

  async function handleLogout() {
    if (submitting) return;
    submitting = true;
    error = "";

    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });

      // 401 means the session was already gone (expired, or revoked elsewhere) — the user is
      // logged out either way, so send them to the login screen rather than showing an error.
      if (response.ok || response.status === 401) {
        window.location.replace("/");
        return;
      }

      error = "Could not log out. Please try again.";
      submitting = false;
    } catch {
      error = "Could not reach the server. Check your connection.";
      submitting = false;
    }
  }
</script>

<div class="flex items-center gap-3">
  {#if error}
    <FieldError>{error}</FieldError>
  {/if}
  <Button type="button" variant="outline" disabled={submitting} onclick={handleLogout}>
    {submitting ? "Logging out…" : "Log out"}
  </Button>
</div>
