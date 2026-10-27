# PostgreSQL row-level security for tenant data

NexusAI currently uses application owner filters. The production database check performed on 2026-10-11 found no RLS policies on tenant tables, and the configured runtime role has `BYPASSRLS`. Policies would not protect the app while it uses that role.

This rollout adds transaction-local account context and a production startup gate. It covers all account-owned tables, including credentials, sessions, OAuth state, Telegram links, agent runs, tasks, approvals, settings, conversations, memories, browser sites, and MCP servers. LangGraph checkpoint rows are tied to their owning agent run or approval, and the checkpointer sets and resets the owner scope on every connection lease. The scheduler receives a separate worker scope for its queue queries. Do not enable this on the live database until it has passed on an isolated staging database.

## 1. Prepare staging

Create a separate Neon project/database for staging. Use synthetic accounts and data; do not clone real user records. Back up production before any later production migration.

Create a runtime role in the staging database using Neon’s SQL Editor. Replace the password placeholder with a newly generated password and save it directly in your local secret store:

```sql
CREATE ROLE nexusai_app LOGIN PASSWORD 'REPLACE_WITH_A_NEW_RANDOM_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT CONNECT ON DATABASE neondb TO nexusai_app;
```

Set `DATABASE_URL` to this role’s Neon connection string. For a separate one-off migration job, set `MIGRATION_DATABASE_URL` to a migration/admin connection string for the same database. Never put the migration credential in the production API service environment, chat, or Git.

## 2. Apply the migration

Run `python -m app.migrate` once from `apps/api` in the separate migration job. Give that job both database URLs; it creates/updates the relational schema and LangGraph checkpoint tables with the migration role. Do not expose the API publicly during the migration. In Neon SQL Editor, first check for legacy unowned rows:

```sql
SELECT
  (SELECT count(*) FROM public.conversations WHERE owner_id IS NULL) AS unowned_conversations,
  (SELECT count(*) FROM public.memories WHERE owner_id IS NULL) AS unowned_memories,
  (SELECT count(*) FROM public.memory_suggestions WHERE owner_id IS NULL) AS unowned_memory_suggestions,
  (SELECT count(*) FROM public.google_credentials WHERE owner_id IS NULL) AS unowned_google_credentials,
  (SELECT count(*) FROM public.auth_sessions WHERE owner_id IS NULL) AS unowned_sessions,
  (SELECT count(*) FROM public.telegram_conversations WHERE owner_id IS NULL) AS unowned_telegram_links,
  (SELECT count(*) FROM public.oauth_states WHERE owner_id IS NULL AND NOT (integration_id = 'auth' AND flow = 'login')) AS unowned_oauth_states;
```

Resolve any nonzero counts using a verified account owner before continuing. Do not guess which user owns those rows.

Run [`apps/api/migrations/001_memory_rls.sql`](../apps/api/migrations/001_memory_rls.sql) in the staging SQL Editor as the migration/admin role. It fails closed if the runtime role is missing, can bypass RLS, or legacy tenant rows have no owner. It grants table access, then applies RLS to all account-owned relational tables and the three LangGraph checkpoint tables.

## 3. Enable the startup gate

Remove `MIGRATION_DATABASE_URL` from the staging API service. Set `RLS_ENFORCEMENT=true` and `PRODUCTION_MODE=true`, restart, and confirm it starts healthy. Production startup rejects a migration credential, a superuser or `BYPASSRLS` runtime role, and missing RLS on any tenant or checkpoint table. The API sets the authenticated owner with transaction-local scope, including on checkpointer connection leases, so pooled connections do not retain a previous request’s owner. Session, OAuth, and Telegram bearer lookups use exact hash/state scopes; the scheduler uses its worker scope only for queue operations.

## 4. Verify isolation

Run the API test suite, then use two separate test accounts in separate browser profiles. Save a distinct memory as each account and verify each can list/search/delete only its own. Also verify conversation and message IDs from the other account return no data (or 404), including direct API requests with edited IDs. Check rejected inserts/updates that try to write another owner’s `owner_id`.

Keep the API suite and staging database checks as deployment gates. The runtime role can still set custom PostgreSQL GUC values, so RLS is defense in depth against application query mistakes, not a boundary against arbitrary SQL execution under the app role. Keep parameterized queries, least-privilege credentials, and outbound egress controls.

## Current status

The code and migration are prepared. On 2026-10-27, an isolated PostgreSQL 16 container ran `app.migrate`, applied this migration to the full schema, and passed production startup and `/health` using the restricted runtime role with no migration credential. Synthetic Alice-owned rows were invisible to Bob in all 18 account-owned relational tables. A direct checkpoint-pool probe returned one row to Alice and zero to Bob or an unscoped connection. A production-mode Google sign-in, session lookup, protected request, and logout passed over an HTTPS test origin. The throwaway database and network were removed. The live Neon database has not been changed. Production enforcement remains off until hosted staging with two real accounts and checkpoint resume flows is verified.
