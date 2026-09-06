import { defineMiddleware } from "astro:middleware";

// Member-only areas. Astro.response.headers does not reach a Response returned from a page —
// a redirect — so the no-store marking lives here rather than in each page's frontmatter.
const PRIVATE_ROUTES = ["/login", "/mypage", "/api/v1/auth"];

// Security headers only. Authentication is checked per route, not here.
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // This origin is cacheable by default, unlike the admin subdomain.
  if (PRIVATE_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});
