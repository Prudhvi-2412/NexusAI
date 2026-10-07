# NexusAI channel setup and API limits

NexusAI supports multiple Google sign-in accounts in one deployment. Keep channel credentials in `docker/.env`; never paste them into chat or commit them. Restart the API after changing that file.

## Implemented

- Voice input uses the browser Web Speech recognition API. A transcript goes into the composer for review before submission. Assistant replies can be read aloud with the browser speech synthesis API.
- Memory records persist in PostgreSQL, with Gemini embeddings in pgvector and semantic/keyword retrieval during chat. The Memory page can create and delete records.
- MCP tools are loaded from the signed-in account's saved connectors plus optional deployment servers. Read-only tools can run directly; write-capable and unannotated tools are approval-gated. Gmail uses `gmail.readonly` for summaries and `gmail.compose` to save a draft after approval. NexusAI does not send email.
- Verified Google sign-ins get an account keyed by their normalized email. Conversations, memories, and Google refresh credentials are scoped to that account by the API.
- Telegram uses one deployment bot. A signed-in user creates a short-lived link code in Connections and sends `/link CODE` to the bot in a private chat. Telegram messages then run under that NexusAI account. Unlinked senders receive only linking instructions.
- In Settings → MCP connectors, each user can add their own remote public HTTPS MCP endpoints and optional bearer tokens. Tokens are encrypted with `GOOGLE_TOKEN_KEY`. Account connectors cannot use local stdio commands; those remain deployment-managed to prevent arbitrary code execution in the API container.

## Google sign-in rollout

Google sign-in creates the NexusAI account on the first successful verified login. If the Google OAuth consent screen is still in **Testing**, Google only lets accounts listed as test users complete sign-in. Add each beta user in Google Cloud Console → Google Auth Platform → Audience → Test users. To accept arbitrary users publicly, publish the consent screen and complete any Google verification required for the requested scopes. `GOOGLE_AUTH_ALLOWED_EMAIL` is retained as the legacy data owner for migration and the service-owner identity for deployment-wide MCP; it no longer blocks other Google accounts from signing in.

## Telegram setup

1. The service operator creates one bot with Telegram's BotFather, stores its token as `TELEGRAM_BOT_TOKEN` in `docker/.env`, and restarts the API.
2. Each user signs in to NexusAI with their verified Google account and connects their own Google services in Connections.
3. In Connections → Telegram, the user creates a link code and sends the shown `/link CODE` command to the shared bot in a private chat.
4. The code is single-use and expires after 10 minutes. The bot processes commands only after a Telegram ID is linked to an account. Users can unlink it in Connections.

The bot does not process group chats. Never share a link code; anyone who gets one can link their Telegram account to the NexusAI account that created it until it expires or is used.
The backend's `telegram_notify_user` helper can deliver server-side task notifications to a linked account. No scheduled task currently emits notifications because the Tasks page is still a preview.

## MCP connector configuration

Use **Settings → MCP connectors** to add an account-owned remote server, save an optional bearer token, and test discovery. The API accepts public HTTPS DNS hostnames, rejects embedded credentials/query strings/fragments and local/private address resolutions, and rechecks DNS before connecting. Tokens are encrypted at rest and the endpoint is not exposed to another account. Read-only tools can run directly; write-capable or unannotated tools pause for approval. Editing an endpoint changes its internal identity so an existing approval cannot run against the new URL.

`MCP_SERVERS_JSON` remains available for operator-managed connectors in `docker/.env`. It supports stdio and Streamable HTTP and is only included in the configured service owner's gateway. Use this for local stdio processes such as the harmless approval test fixture below. Approval cards show the tool and exact arguments. Gmail draft saving is a separate account-scoped action gated by the same approval graph; it never sends.

For a local approval-flow check, the API image includes a harmless fixture tool named `record_approval_test` in `app.approval_test_mcp`. Configure it temporarily as a stdio MCP server with command `python` and args `['-m', 'app.approval_test_mcp']`. It appends the approved marker to `/tmp/nexusai-approval-test.log` inside the API container. Remove that server from `MCP_SERVERS_JSON` after testing; do not deploy the fixture as a production connector.

## Instagram and LinkedIn

These providers are not marked connected until real credentials and required app access are configured.

- **Instagram:** The official Instagram Login messaging API is for Professional (Business/Creator) accounts. Messaging requires the `instagram_business_manage_messages` permission, and the recipient must have messaged the professional account first. Group messaging is unsupported. A normal personal account is not eligible. [Meta Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-db99ce99-bf76-475c-8b76-718576c11cae).
- **LinkedIn:** The general Posts API can publish member posts with `w_member_social`; read access to member posts is restricted to approved users. Organization publishing also requires the correct page role and organization permission. LinkedIn lists separate Communications APIs for invitations and messages, but access is authorization-gated; NexusAI will not automate the LinkedIn website or claim inbox access without the matching product approval. [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03), [LinkedIn Communications APIs](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/overview).

## Browser automation boundary

Playwright is reserved for a specific site workflow when that site offers no suitable API. Start with public-page reading and extraction. For signed-in pages, the account owner must provide an approved session method. Before a browser action sends a message, publishes content, purchases, deletes, or changes an account, NexusAI must show the exact action and payload in the UI and wait for the user's approval. Browser automation is not integrated with the MCP action approval flow yet.
