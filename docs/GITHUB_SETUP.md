# GitHub connection setup

NexusAI connects each signed-in account to GitHub separately. The connection uses an OAuth flow for a GitHub App, encrypts the user's short-lived access and refresh tokens with `GOOGLE_TOKEN_KEY`, and stores them against that NexusAI account. NexusAI currently reads repository metadata, issues, pull requests, and Actions workflow runs. It cannot write, merge, comment, or trigger runs.

## Create the GitHub App

1. In GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Give it a name such as `NexusAI`, set the homepage URL to `http://localhost:3000`, and set the **User authorization callback URL** to `http://localhost:8000/api/v1/integrations/github/callback`. Webhooks are not needed.
3. Enable user authorization (OAuth). Keep user token expiration enabled.
4. Under **Repository permissions**, set:
   - **Metadata**: Read-only (required)
   - **Issues**: Read-only
   - **Pull requests**: Read-only
   - **Actions**: Read-only
5. Keep all other permissions at **No access**. Do not add write permissions.
6. Save the app. Copy its **Client ID** and create/copy a **Client secret**.
7. Install the app on your GitHub account or organization and select the repositories NexusAI should read. The app can only access repositories covered by both the user's GitHub account and the app's installation/permissions.

## Configure NexusAI

Add these settings to `docker/.env` (the env file used by the documented Docker Compose command):

```dotenv
GITHUB_APP_CLIENT_ID=your_github_app_client_id
GITHUB_APP_CLIENT_SECRET=your_github_app_client_secret
GITHUB_REDIRECT_URI=http://localhost:8000/api/v1/integrations/github/callback
```

Rebuild and start the API and web containers:

```powershell
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d --build api web
```

Then open **Connections → GitHub → Connect** and approve the requested access. A connected account should appear as `@your-github-login`.

## Try it in chat

- `List my GitHub repositories`
- `Show open issues in owner/repo`
- `List open pull requests in owner/repo`
- `Show recent workflow runs in owner/repo`

NexusAI will first show your accessible repositories if a repository-specific question does not name one. GitHub API data is treated as untrusted context by the assistant.
