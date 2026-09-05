import { defineMiddleware } from "astro:middleware";

// Security headers only. Auth isn't checked here — each route checks its own session, since
// there's no framework middleware stack to hang authorization off. CSP belongs in
// astro.config.mjs, not here.
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
});
