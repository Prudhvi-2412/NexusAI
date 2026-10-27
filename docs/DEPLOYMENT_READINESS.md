# Deployment readiness: Vercel web and Render API

This is a release checklist, not evidence of a deployed service. Run it against
an isolated staging database before making the application public.

For a $0 personal demonstration, use [FREE_TIER_DEMO.md](FREE_TIER_DEMO.md)
instead. Free hosting and Gemini use have restrictions that make them unsuitable
for a real-user production service.

## Required configuration

- Use Node.js 20.9 or newer for the Next.js web build. Set the Vercel root to
  the repository root so workspace packages resolve. The web build command is
  `npm run build --workspace=@nexusai/web`. Set
  `NEXT_PUBLIC_USE_MOCK_API=false`, `NEXT_PUBLIC_API_URL=/api/v1`, and
  `NEXUS_API_ORIGIN=https://YOUR-API.onrender.com`. The Next.js rewrite proxies
  `/api/*` to the API while keeping the browser on the Vercel origin. Register
  the exact Google login and integration callback URLs on the Vercel origin
  (`https://YOUR-APP.vercel.app/api/v1/integrations/google/callback`, and the
  corresponding GitHub, LinkedIn, and Instagram callback paths). Set
  `WEB_URL=https://YOUR-APP.vercel.app` and
  `CORS_ORIGINS=https://YOUR-APP.vercel.app`. This same-origin setup keeps the
  session cookie first-party, including the OAuth callback. `NEXT_PUBLIC_*`
  values are embedded in the built frontend, so rebuild after changing them.
- Deploy the API as a persistent Render Docker web service using
  `docker/Dockerfile.api`, with a health check at `/health`. Scheduler and
  Telegram polling use a PostgreSQL advisory-lock leader. Keep exactly one API
  instance while the interactive browser sign-in session is process-local;
  saved website sessions are encrypted in PostgreSQL and available across
  restarts. Do not scale API replicas until interactive browser sessions have a
  shared browser worker or verified session-routing service. Do not rely on a
  sleeping instance for scheduled work.
- Use a separate PostgreSQL database for staging. Apply
  [SECURITY_RLS.md](SECURITY_RLS.md) with a least-privilege `nexusai_app`
  runtime role and a separate migration role. Set `DATABASE_URL` to the runtime
  role. Run `python -m app.migrate` in a one-off job with `MIGRATION_DATABASE_URL`
  set to the migration role, then apply the RLS SQL. Remove the migration URL
  from the API service and set `RLS_ENFORCEMENT=true` and `PRODUCTION_MODE=true`
  only after staging verification. Startup rejects missing RLS policies on all
  account-owned tables and LangGraph checkpoint tables.
- Generate and store `SESSION_SECRET` (at least 32 characters) and
  `GOOGLE_TOKEN_KEY` privately. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI=https://api.YOUR_DOMAIN/api/v1/integrations/google/callback`,
  `WEB_URL=https://app.YOUR_DOMAIN`, and `CORS_ORIGINS=https://app.YOUR_DOMAIN`.
  Register the exact callback in Google Cloud. Rotate any credentials shared in
  chat, screenshots, logs, or old local files before deployment.
- The Vercel API rewrite keeps API fetches and OAuth callback responses on the
  same browser origin, so `SESSION_COOKIE_SAMESITE=lax` works with the default
  Vercel and Render hostnames. Keep the Render API URL out of browser requests;
  set `NEXT_PUBLIC_API_URL=/api/v1` and `NEXUS_API_ORIGIN` as above. Do not set
  `SameSite=None` to work around a broken proxy; it relies on third-party cookie
  behavior.
- Production mode applies shared database rate limits to OAuth starts, model
  runs, browser sign-in and interaction, and direct MCP calls. Interactive
  agent runs are capped at 30 per account per hour, 100 per account per UTC day,
  and 1,000 globally per UTC day. Scheduled runs are bounded to 10 per account
  and 100 globally per UTC day, with 1,024 output
  tokens and at most 3 tool rounds per run. Add a provider-side monetary budget
  and alert before public access; these caps limit run volume, not an exact
  dollar amount. Telegram model and voice requests are bounded to 20 per
  account and 300 globally per UTC day; embedding requests are limited to 60
  per account per hour and 1,000 globally per UTC day.
- The API image runs a loopback-only Squid proxy on `127.0.0.1:3128`; use
  `PUBLIC_EGRESS_PROXY=http://127.0.0.1:3128`. Its ACL denies private, loopback,
  link-local, multicast, reserved, and cloud metadata destinations after DNS
  resolution. Browser automation and remote MCP traffic use this proxy. Do not
  expose port 3128 publicly. Run the proxy verification script after building
  the image and repeat the check against the deployed service before use.
- The API Dockerfile installs pinned versions from `apps/api/requirements.lock`,
  captured from the test image. Review dependency advisories and regenerate the
  lockfile deliberately when upgrading; `requirements.txt` remains the
  developer-facing version range list.

## Release checks

1. Run `npm audit --omit=dev --audit-level=moderate`, frontend lint, typecheck,
   and build. Run the API tests inside the API container.
2. In staging, sign in as two different Google accounts. Verify each can only
   see its own conversations, memories, browser sites, credentials, tasks, and
   approvals. Test direct requests using another account's record IDs.
3. Verify Google, GitHub, LinkedIn, and Instagram callbacks reject requests
   from the wrong account and do not consume the rightful owner's OAuth state.
   Check that approved browser actions require the explicit approval record.
4. Confirm browser sign-in, saved-site inspection, and approved action behavior
   in staging. Verify the configured egress proxy blocks internal destinations
   and DNS rebinding for both the browser and remote MCP traffic.
5. Test logout, expired sessions, cookie behavior in the actual browser, CORS,
   the API health check, one scheduled task, and a cold restart. Confirm all
   secrets remain out of Git and logs. Keep a tested database backup and a
   rollback route before opening access.
