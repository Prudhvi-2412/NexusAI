# NexusAI project review

Reviewed 10 October 2026. This describes the code and verification in the local workspace; third-party production access still depends on provider app configuration and account review.

## Current implementation

- **Authentication:** Google OAuth login, verified email identity, one-time OAuth state, HTTP-only session cookies, expiry checks, logout, and request-origin checks for browser mutations.
- **Account separation:** Conversations, memories, settings, MCP servers, approvals, scheduled tasks, OAuth state, and connector credentials use an account owner key. Connector credentials are encrypted with the configured Fernet key. Owner-filter checks are covered by cross-account tests.
- **Connectors:** Gmail read and approval-gated draft creation; read-only Google Calendar, Classroom, and Contacts; GitHub repository data; LinkedIn profile and approval-gated posts; Instagram professional profile and conversations with approval-gated replies; shared Telegram bot with per-user linking and voice messages; account-owned MCP servers; isolated Playwright for public HTTPS pages.
- **Memory:** User-owned Postgres records, pgvector embeddings when Gemini embedding is available, keyword fallback retrieval, and review-before-saving suggestions.
- **Tasks and approvals:** The in-process scheduler reads saved tasks, tasks are account scoped, scheduled tool manifests are read-only, and connector writes pause for a stored approval. The executor verifies the approved service, tool, and exact arguments before execution.
- **Activity and Insights:** Run and tool events are stored per account. Gemini token counts are taken from provider usage metadata when present. The UI reports provider cost as unavailable instead of displaying a fake zero.
- **Production data path:** Docker builds the web app with `NEXT_PUBLIC_USE_MOCK_API=false`. Mock data remains available for local preview mode only.

## Code map

- `apps/api/app/config.py` holds environment-backed settings.
- `apps/api/app/models.py` holds SQLAlchemy persistence models.
- `apps/api/app/agent_graph.py` defines specialist routing and approval checkpoints.
- `apps/api/app/mcp_gateway.py` handles configured MCP transports and tool permission hints.
- `apps/api/app/browser_automation.py` constrains Playwright URLs and actions.
- `apps/api/app/main.py` still contains API routes and orchestration. It is the largest remaining module; move route groups into routers/services in later, test-backed steps rather than risk a broad rewrite without parity checks.

## Verification completed

- Python syntax checks passed for the API, models, settings, and tests.
- Frontend TypeScript typecheck passed.
- Production Next.js build passed for all routes.
- All 40 API contract tests passed in the Python 3.11 Docker image. The suite exercises Google login/session issuance with a mocked provider, one-time OAuth state, expiry/origin rejection, data isolation, credential encryption, approval execution boundaries, task scheduling, MCP security, Playwright Chromium, and Telegram voice handling.
- Rebuilt and restarted the local API and web containers. Local probes returned API health 200, web 200, and signed-out session 401.

## Remaining external work and limits

- Instagram requires Meta App ID/Secret, the exact callback URL, a professional Business/Creator test account, and Meta app review/advanced access for public users. The local OAuth callback was tested with a mocked provider; a real Meta account was not used in this test run.
- Google, GitHub, LinkedIn, Telegram, and Gemini live requests still require their configured credentials and provider-side access. Provider OAuth flows were tested with mocked HTTP responses; live account consent was not repeated here.
- Tenant isolation is enforced in application queries and tests; Postgres row-level security policies are not configured as a second enforcement layer.
- Scheduled jobs run in the API process with database claims. There is no separate Celery worker service yet, so a dedicated durable job queue is a scaling improvement.
- Cost estimates are not calculated because pricing is model- and provider-dependent; token counts are recorded only when Gemini returns usage metadata.
- This is an engineering review and automated test run, not an independent penetration test or security certification.

## Credential handling

Secrets pasted into conversation history should be treated as exposed. Rotate the Telegram bot token, Google OAuth client secret, Gemini API key, and Neon database password before sharing or deploying the project. Store replacements only in the local environment file or a secrets manager; do not paste them into chat or commit them.
