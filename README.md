# NexusAI

NexusAI is a self-hostable AI assistant with a web chat, account-scoped connections, long-term memory, scheduled tasks, and an approval center. Users sign in with their own Google account, then connect only the services they want to use.

## What each user can connect

| Service | What it does | Account and permission notes |
| --- | --- | --- |
| Google / Gmail | Sign in; summarize unread Gmail; read Calendar, Classroom, and Contacts when connected; save Gmail drafts after approval | Every user authorizes their own Google account. Gmail is read-only unless the user separately grants compose access. NexusAI saves drafts but never sends them. |
| GitHub | Read repositories, issues, pull requests, and Actions workflow runs | Each user authorizes their own GitHub account. Access is read-only and limited by the GitHub App installation. |
| LinkedIn | Read the connected member profile and publish a post after approval | Each user authorizes their own LinkedIn account. Feed, messages, and organization posting are not supported. |
| Instagram | Read a professional profile and recent conversations; send a requested reply after approval | Each user authorizes their own Business or Creator account. The other participant must have messaged the account first. Personal accounts are unsupported. |
| Telegram | Send chat or voice messages to the shared bot | The operator configures one bot. Each user links their own Telegram ID using an expiring one-time code. |
| Browser | Inspect public HTTPS pages and save a website sign-in for later inspections and approved actions | Each user controls their own saved website sessions. Local and private network destinations are blocked. |
| Custom MCP | Add an account-owned remote tool server | Each user supplies their own public HTTPS endpoint and optional bearer token. Remote tool calls require approval. |

## Run NexusAI locally

### Requirements

- Docker Desktop with Docker Compose
- A Gemini API key for live chat
- A Google OAuth web client for sign-in

### Start

1. Copy `docker/.env.docker.example` to `docker/.env`.
2. Set `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AUTH_ALLOWED_EMAIL`, and `DATABASE_URL`. For local development, use a new empty database; do not point a demo instance at a database containing private data.
3. Generate `GOOGLE_TOKEN_KEY` with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and `SESSION_SECRET` with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Keep `docker/.env` private and out of Git.
4. In Google Cloud, add `http://localhost:8000/api/v1/integrations/google/callback` as an authorized redirect URI. The same callback handles Google sign-in and Google service connections.
5. Start the app from the repository root:

   ```bash
   docker compose --env-file docker/.env -f docker/docker-compose.yml up --build
   ```

6. Open [http://localhost:3000](http://localhost:3000). The API health endpoint is [http://localhost:8000/health](http://localhost:8000/health).

The Compose PostgreSQL service is optional but recommended for local use. Set `DATABASE_URL=postgresql://nexus:nexus_secret@postgres:5432/nexusai` in `docker/.env`, then start it with:

```bash
docker compose --profile local-db --env-file docker/.env -f docker/docker-compose.yml up --build
```

See [deployment readiness](docs/DEPLOYMENT_READINESS.md) before hosting the app for other people.

## Connect your personal accounts

First, sign into NexusAI with the Google account that should own your workspace. Open **Connections** and choose **Connect** for each service. Each OAuth flow must start from the same NexusAI account that will own that connection. Provider credentials are configured once by the person hosting NexusAI; users then authorize their own accounts in the app.

### Google, Gmail, Calendar, Classroom, and Contacts

The host creates a Google OAuth web client, enables Gmail API, Google Calendar API, Google Classroom API, and People API as needed, then configures `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the callback URL for their deployment. For local setup, see [Google and channel setup](docs/CHANNEL_SETUP.md#google-sign-in-rollout). For a hosted setup, register the exact URLs described in [deployment readiness](docs/DEPLOYMENT_READINESS.md).

Each user signs into NexusAI with their own Google account, then opens **Connections** and connects Gmail, Calendar, Classroom, or Contacts separately. Google may restrict sign-in to test users while the OAuth consent screen is in Testing. The user must be added as a test user until the host completes the required Google verification and publishes the consent screen.

Gmail summaries use read-only access. To create a draft, a user must grant Gmail compose access and approve the exact draft in **Approvals**. NexusAI does not send Gmail messages.

### GitHub

The host creates a GitHub App and configures its client ID, secret, and callback. Grant **Metadata**, **Issues**, **Pull requests**, and **Actions** read-only access; do not grant write permissions. Install the app on the repositories it may read. Then each user opens **Connections → GitHub → Connect** and authorizes their own GitHub account. Follow [GitHub setup](docs/GITHUB_SETUP.md) for the complete configuration.

### LinkedIn

The host creates a LinkedIn developer app, enables **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**, and sets `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_REDIRECT_URI`. Register the exact callback URL for the deployment. Each user then opens **Connections → LinkedIn → Connect** and signs into their own member account. A post is published only after the user approves its exact text. NexusAI does not read the feed or messages, and does not publish to organizations.

### Instagram

The host configures a Meta developer app for **Instagram API with Instagram Login**, then sets `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, and `INSTAGRAM_REDIRECT_URI`. Enable `instagram_business_basic` and `instagram_business_manage_messages`, and register the exact callback URL for the deployment. Each user opens **Connections → Instagram → Connect** and authorizes their own professional Business or Creator account. During development, the user may need to be added as an app tester; broader access may require Meta review. Replies require an explicit request and approval. Personal accounts and group messaging are unsupported.

### Telegram

The host creates a bot with BotFather and configures `TELEGRAM_BOT_TOKEN`. Each user signs into their NexusAI account, opens **Connections → Telegram**, creates a link code, and sends the displayed `/link CODE` command to the bot in a private chat. The code expires after 10 minutes and works once. Do not share it.

### Signed-in websites

Open **Connections → Browser → Manage websites**, enter the public HTTPS sign-in page, and sign in in the short-lived browser window. Save the site when finished. The encrypted session belongs to the current NexusAI account and can be removed from Connections. In chat, page inspection may use the saved session; form fills and clicks require approval. Some sites block automation or require CAPTCHAs.

### Custom MCP server

Open **Settings → MCP connectors**, enter a connector name and public HTTPS MCP endpoint, optionally add a bearer token, and test discovery. Tokens are encrypted at rest. Every remote tool requires approval, regardless of the server's read-only annotation. See [MCP connector details](docs/CHANNEL_SETUP.md#mcp-connector-configuration).

## Deployment and demo limits

Use a separate database and least-privilege runtime role for each deployment. Never commit `.env` files, provider secrets, database passwords, or user tokens. Configure OAuth callback URLs to match the public application exactly. Follow the [deployment readiness checklist](docs/DEPLOYMENT_READINESS.md) before enabling real users.

The [free-tier demo guide](docs/FREE_TIER_DEMO.md) is for synthetic data. Free hosting may sleep or expire, and free AI services may have limited quotas or different data handling terms. Do not connect personal accounts or enter sensitive information in a public free demo.

## Project guides

- [Deployment readiness](docs/DEPLOYMENT_READINESS.md)
- [Channel setup and limits](docs/CHANNEL_SETUP.md)
- [Google and GitHub account setup](docs/GITHUB_SETUP.md)
- [MCP architecture](docs/MCP_ARCHITECTURE.md)
- [Security and row-level security](docs/SECURITY_RLS.md)
- [Free-tier synthetic-data demo](docs/FREE_TIER_DEMO.md)
- [Architecture diagrams](architecture/README.md)
