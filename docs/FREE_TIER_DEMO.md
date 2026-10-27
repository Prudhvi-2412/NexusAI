# Free-tier personal demo

This setup is for a personal, synthetic-data demonstration of NexusAI. It is
not a production deployment and must not be used for real users or personal
mail, calendar, messages, credentials, or other confidential information.

## Free services and limits

- Render's free web instance has 512 MB RAM and 0.1 CPU, sleeps after 15 minutes
  without inbound traffic, and may take about a minute to wake. Render says its
  free services are for testing and hobby projects, not production. Free Render
  Postgres expires after 30 days, has no backups, and free services cannot run
  one-off jobs or receive private-network traffic. Do not put the only copy of
  demo data in Render Postgres.
- Create a separate Neon Free project for this demo; do not reuse the live
  database URL. Neon currently lists 1 GB storage and 100 compute-hours per
  project per month on its Free plan. Check the current dashboard limits before
  relying on the service.
- Gemini's free tier has model-specific quotas and can reject requests when a
  quota is reached. Google may use prompts and responses to improve products,
  and human reviewers may process them. Google's terms say not to submit
  sensitive, confidential, or personal information to unpaid Gemini services.
  Use synthetic messages and records only. Do not connect Gmail, Calendar,
  Telegram, social accounts, MCP servers, or signed-in websites in this demo.

These limits mean a free deployment can demonstrate the interface and basic
agent behavior, but it cannot promise uptime, durable backups, reliable
scheduling, production privacy, or production browser automation. Render free
instances may restart, and the app's scheduler pauses while the backend sleeps.
The 512 MB backend may also run out of memory when Chromium is launched; keep
browser automation off for the demo unless a staging test proves it fits.

## Render configuration

The root `render.yaml` defines separate free Docker web services for the API
and Next.js app. Create a Render Blueprint from this repository. Its service
names and same-origin proxy settings are declared in the file; never add local
`.env` files to the repository. Set the prompted `DATABASE_URL` to the
least-privilege `nexusai_app` role on a fresh demo database.

```text
NEXT_PUBLIC_USE_MOCK_API=false
NEXT_PUBLIC_FREE_TIER_DEMO=true
NEXT_PUBLIC_API_URL=/api/v1
NEXUS_API_ORIGIN=https://nexusai-api-demo.onrender.com
```

The Next.js rewrite keeps API requests on the Render web-service origin. The
Render API environment sets `PRODUCTION_MODE=true`, `RLS_ENFORCEMENT=true`, and
`PUBLIC_EGRESS_PROXY=http://127.0.0.1:3128`. The API Docker image runs Squid
bound only to loopback; do not expose port 3128. Keep a single API instance
because interactive browser login sessions are process-local. Render injects
`PORT`; the container supervisor binds Uvicorn to that value.

Set `FREE_TIER_DEMO_MODE=true` and `GOOGLE_AUTH_ALLOWED_EMAIL` to the one Google
account allowed to sign in. This mode disables connector, MCP, Telegram, and
browser-automation APIs and skips the specialist data-access workflow. Use a
fresh demo database so no old conversation history is sent to Gemini. The chat
banner warns users to keep prompts synthetic; never put personal or
confidential content in the demo.

Use the Render web-service origin for `WEB_URL`, `CORS_ORIGINS`, and OAuth
callback URLs. Google login returns through the same-origin proxy at
`https://nexusai-web-demo.onrender.com/api/v1/integrations/google/callback`;
register this exact URL with Google before sign-in testing.

Use a fresh Neon project or a separate Render free Postgres database for demo
data. Render free Postgres expires after 30 days and has no backups. Run the
relational/checkpoint schema migrations and the RLS migration from a trusted
environment using a separate migration-role URL. Verify RLS using the
`nexusai_app` runtime role before putting its URL in Render. Never use the
current Neon database for the demo or leave `MIGRATION_DATABASE_URL` on the
running API service.

Before sharing the demo, verify `/health`, sign-in and logout, the same-origin
API rewrite, tenant isolation in the Neon demo database, and that the browser
proxy blocks loopback, private, link-local, metadata, and DNS-rebinding targets.
The bundled proxy check is:

```powershell
docker build -f docker/Dockerfile.api -t nexusai-api:demo .
docker run --rm --add-host rebind-test.example:127.0.0.1 --entrypoint python nexusai-api:demo /app/verify_egress_proxy.py
```

Only use synthetic data. Do not treat the demo URL as a production service.

## Official free-tier terms and limits

- [Render free services](https://render.com/docs/free)
- [Render free compute limits](https://render.com/docs/compute-plans)
- [Gemini API unpaid-service terms](https://ai.google.dev/gemini-api/terms)
- [Gemini API pricing and free-tier data use](https://ai.google.dev/gemini-api/docs/pricing)
- [Neon Free plan update](https://neon.com/blog/neon-free-plan-1-gb-per-project)
