# NexusAI channel setup and API limits

NexusAI supports multiple Google sign-in accounts in one deployment. Keep channel credentials in `docker/.env`; never paste them into chat or commit them. Restart the API after changing that file.

## Implemented

- Voice input uses the browser Web Speech recognition API. A transcript goes into the composer for review before submission. Assistant replies can be read aloud with the browser speech synthesis API.
- Memory records persist in PostgreSQL, with Gemini embeddings in pgvector and semantic/keyword retrieval during chat. The Memory page can create and delete records.
- MCP tools are loaded from the signed-in account's saved connectors plus optional deployment servers. Read-only tools can run directly; write-capable and unannotated tools are approval-gated. Gmail uses `gmail.readonly` for summaries and `gmail.compose` to save a draft after approval. NexusAI does not send email.
- Verified Google sign-ins get an account keyed by their normalized email. Conversations, memories, and Google refresh credentials are scoped to that account by the API.
- Telegram uses one deployment bot. A signed-in user creates a short-lived link code in Connections and sends `/link CODE` to the bot in a private chat. Telegram text and voice messages then run under that NexusAI account. Incoming voice notes (up to 5 minutes and 14 MB) are downloaded in memory, transcribed by Gemini, processed in the user's chat, and returned as text plus an MP3 voice note. Audio is not saved by NexusAI; the transcript and assistant response are saved to the user's conversation. Voice transcription and TTS use the configured Gemini API key and can incur API usage. If TTS is unavailable or the response is too long, the bot sends the text response and explains that voice could not be attached.
- In Settings → MCP connectors, each user can add their own remote public HTTPS MCP endpoints and optional bearer tokens. Tokens are encrypted with `GOOGLE_TOKEN_KEY`. Account connectors cannot use local stdio commands; those remain deployment-managed to prevent arbitrary code execution in the API container.

## Google sign-in rollout

Google sign-in creates the NexusAI account on the first successful verified login. If the Google OAuth consent screen is still in **Testing**, Google only lets accounts listed as test users complete sign-in. Add each beta user in Google Cloud Console → Google Auth Platform → Audience → Test users. To accept arbitrary users publicly, publish the consent screen and complete any Google verification required for the requested scopes. `GOOGLE_AUTH_ALLOWED_EMAIL` is retained as the legacy data owner for migration and the service-owner identity for deployment-wide MCP; it no longer blocks other Google accounts from signing in.

## Telegram setup

1. The service operator creates one bot with Telegram's BotFather, stores its token as `TELEGRAM_BOT_TOKEN` in `docker/.env`, and restarts the API.
2. Each user signs in to NexusAI with their verified Google account and connects their own Google services in Connections.
3. In Connections → Telegram, the user creates a link code and sends the shown `/link CODE` command to the shared bot in a private chat.
4. The code is single-use and expires after 10 minutes. The bot processes commands only after a Telegram ID is linked to an account. Users can unlink it in Connections.
5. Send the bot a private voice note to test the voice flow. The bot transcribes it, handles the transcript in that account's NexusAI conversation, and sends back the transcript, assistant answer, and a spoken voice note. Text messages continue to work as before.

The bot does not process group chats. Never share a link code; anyone who gets one can link their Telegram account to the NexusAI account that created it until it expires or is used.
The backend's `telegram_notify_user` helper can deliver server-side task notifications to a linked account. No scheduled task currently emits notifications because the Tasks page is still a preview.

## MCP connector configuration

Use **Settings → MCP connectors** to add an account-owned remote server, save an optional bearer token, and test discovery. The API accepts public HTTPS DNS hostnames, rejects embedded credentials/query strings/fragments and local/private address resolutions, and rechecks DNS before connecting. Tokens are encrypted at rest and the endpoint is not exposed to another account. Read-only tools can run directly; write-capable or unannotated tools pause for approval. Editing an endpoint changes its internal identity so an existing approval cannot run against the new URL.

`MCP_SERVERS_JSON` remains available for operator-managed connectors in `docker/.env`. It supports stdio and Streamable HTTP and is only included in the configured service owner's gateway. Use this for local stdio processes such as the harmless approval test fixture below. Approval cards show the tool and exact arguments. Gmail draft saving is a separate account-scoped action gated by the same approval graph; it never sends.

For a local approval-flow check, the API image includes a harmless fixture tool named `record_approval_test` in `app.approval_test_mcp`. Configure it temporarily as a stdio MCP server with command `python` and args `['-m', 'app.approval_test_mcp']`. It appends the approved marker to `/tmp/nexusai-approval-test.log` inside the API container. Remove that server from `MCP_SERVERS_JSON` after testing; do not deploy the fixture as a production connector.

## Instagram and LinkedIn

These providers are not marked connected until real credentials and required app access are configured.

- **Instagram:** NexusAI uses Meta's Instagram Login for professional Business or Creator accounts. Set `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, and `INSTAGRAM_REDIRECT_URI` in `docker/.env`. In the Meta developer dashboard, configure Instagram API with Instagram Login and register `http://localhost:8000/api/v1/integrations/instagram/callback` as the exact redirect URI. Request `instagram_business_basic` and `instagram_business_manage_messages`. Each NexusAI user connects their own professional account; the token is encrypted and stored under that user's account. NexusAI can show the profile and recent conversations. Replies are sent only after the user explicitly asks and approves the exact reply in Approvals. The recipient must have messaged the professional account first; group messaging and personal accounts are unsupported. During development, connect an account assigned as an app tester; public use requires the relevant Meta app review/advanced access. [Meta Instagram API with Instagram Login](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login), [Meta Instagram API docs](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00), [Meta Messaging API text message](https://www.postman.com/meta/instagram/request/1rgmhuk/text-message).
- **LinkedIn:** Member profile/email connection uses OpenID Connect; publishing a plain-text post is available through `w_member_social` after you approve the exact post in NexusAI. Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_REDIRECT_URI` in `docker/.env`, then enable **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** in the LinkedIn developer portal. Register `http://localhost:8000/api/v1/integrations/linkedin/callback` as the redirect URL. NexusAI does not currently read the member's feed or messages; those products/permissions are separately restricted. Organization posts are not supported. [Getting access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access), [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09), [LinkedIn Communications APIs](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/overview).

## Browser automation boundary

The built-in Playwright browser is available in Connections. It can inspect public HTTPS pages and return visible text, links, and form labels. A user can also choose **Manage websites**, open a public HTTPS sign-in page, operate the browser view directly, and save that website's session. The interactive sign-in browser expires after 10 minutes of inactivity. The saved cookies and local storage are scoped to the connected website, encrypted with `GOOGLE_TOKEN_KEY`, and stored under the signed-in NexusAI account. Password text entered into the browser view is not added to chat or memory. Remove a saved website in Connections to delete its stored session.

In chat, the browser tools can use a saved website session for pages on that host or its subdomains. Each inspection or approved action launches a fresh isolated browser context loaded with that website's saved state; refreshed state is saved again. Public-site browsing works without a saved session. Local/private network addresses and non-HTTPS URLs remain blocked. Some sites block automation, require CAPTCHAs, use pop-ups the browser view cannot handle, or expire sessions; reconnect those sites when needed. Saving a browser session does not verify that sign-in succeeded.

Filling a labeled field or clicking a visible button/link uses the durable MCP action approval flow. The exact URL and bounded action list are shown in Approvals before execution. Page text is untrusted input and is never treated as an instruction. The browser context closes when the action finishes, and an interrupted action is not automatically repeated. Saved sessions are sensitive account credentials; use them only for websites you trust and disconnect them when no longer needed.
