import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";

// login-form.svelte keeps the button disabled until onMount, so "enabled" is the hydration
// signal — and the only check that catches a page missing its client:* directive.
async function login(page: Page, email: string, password: string) {
  const submit = page.getByRole("button", { name: "Login" });
  await expect(submit).toBeEnabled();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submit.click();
}

test.describe("login screen", () => {
  test("labels are programmatically associated with their inputs", async ({ page }) => {
    await page.goto("/");

    // getByLabel only resolves through an intact <label for>/id pair, so this is an a11y check.
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  });

  test("the middleware's security headers are present", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("every admin API rejects an unauthenticated request on its own", async ({ request, baseURL }) => {
    // There is no auth middleware, so a route that forgets requireSession is simply open. Add
    // new routes here — this is the only place the omission shows up.
    expect((await request.get("/api/v1/auth/me")).status()).toBe(401);
    expect((await request.get("/api/v1/inquiries")).status()).toBe(401);
    expect((await request.get("/api/v1/inquiries/anything")).status()).toBe(401);
    expect((await request.get("/api/v1/media")).status()).toBe(401);
    expect((await request.get("/api/v1/media/anything")).status()).toBe(401);

    // Astro answers a mutating request 403 before the route runs, so these carry an Origin —
    // without it the assertion would pass on the CSRF check, not the guard.
    const headers = { Origin: baseURL! };
    expect((await request.post("/api/v1/inquiries/anything/start", { headers })).status()).toBe(401);
    expect((await request.delete("/api/v1/inquiries/anything", { headers })).status()).toBe(401);
    expect((await request.post("/api/v1/media", { headers, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.alloc(4) } } })).status()).toBe(401);
    expect((await request.patch("/api/v1/media/anything", { headers, data: {} })).status()).toBe(401);
    expect((await request.delete("/api/v1/media/anything", { headers })).status()).toBe(401);
  });

  test("a mutating request from another origin is refused", async ({ request }) => {
    const response = await request.post("/api/v1/auth/logout", { headers: { Origin: "https://attacker.example" } });
    expect(response.status()).toBe(403);
  });
});

test.describe("login flow", () => {
  test("wrong credentials stay on the login screen and reveal nothing", async ({ page }) => {
    await page.goto("/");
    await login(page, E2E_ADMIN.email, "not-the-password");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(E2E_ADMIN.email);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("correct credentials reach the dashboard with an HttpOnly session cookie", async ({ page, context }) => {
    await page.goto("/");
    await login(page, E2E_ADMIN.email, E2E_ADMIN.password);

    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(E2E_ADMIN.email)).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === "admin_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });

  test("the dashboard redirects when unauthenticated", async ({ page }) => {
    // Guarded in the page frontmatter, so this holds regardless of client-side JS.
    await page.goto("/dashboard");

    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("logging out revokes the session, not just the cookie", async ({ page }) => {
    await page.goto("/");
    await login(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await page.waitForURL("**/dashboard");

    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/$/);

    await page.goto("/dashboard");
    expect(new URL(page.url()).pathname).toBe("/");
  });
});
