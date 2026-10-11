# Staged PostgreSQL row-level security for memory

NexusAI currently uses application owner filters. The production database check performed on 2026-10-11 found no RLS policies on tenant tables, and the configured runtime role has `BYPASSRLS`. Policies would not protect the app while it uses that role.

This rollout adds a transaction-local owner setting and a startup gate. It covers memories, memory suggestions, conversations, and messages. Do not enable it on the live database until it has passed on an isolated staging database.

## 1. Prepare staging

Create a separate Neon project/database for staging. Use synthetic accounts and data; do not clone real user records. Back up production before any later production migration.

Create a runtime role in the staging database using Neon’s SQL Editor. Replace the password placeholder with a newly generated password and save it directly in your local secret store:

```sql
CREATE ROLE nexusai_app LOGIN PASSWORD 'REPLACE_WITH_A_NEW_RANDOM_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT CONNECT ON DATABASE neondb TO nexusai_app;
```

Set `DATABASE_URL` to this role’s Neon connection string. Set `MIGRATION_DATABASE_URL` to a separate migration/admin connection string for the same database. Keep both values in the local Docker environment file; never paste them into chat or commit them.

## 2. Apply the migration

Start the API once with `RLS_ENFORCEMENT=false` and both database URLs configured so the existing startup schema migration can create/update the tables using `MIGRATION_DATABASE_URL`. In Neon SQL Editor, first check for legacy unowned rows:

```sql
SELECT
  (SELECT count(*) FROM public.conversations WHERE owner_id IS NULL) AS unowned_conversations,
  (SELECT count(*) FROM public.memories WHERE owner_id IS NULL) AS unowned_memories,
  (SELECT count(*) FROM public.memory_suggestions WHERE owner_id IS NULL) AS unowned_memory_suggestions;
```

Resolve any nonzero counts using a verified account owner before continuing. Do not guess which user owns those rows.

Run [`apps/api/migrations/001_memory_rls.sql`](../apps/api/migrations/001_memory_rls.sql) in the staging SQL Editor as the migration/admin role. It fails closed if the runtime role is missing, can bypass RLS, or legacy tenant rows have no owner. It grants table access, then RLS limits these four tables to `nexusai.owner_id`.

## 3. Enable the startup gate

Set `RLS_ENFORCEMENT=true`, restart the staging API, and confirm it starts healthy. Startup now rejects a superuser or `BYPASSRLS` runtime role and rejects missing RLS on any covered table. The API sets the authenticated owner with transaction-local scope, so pooled connections do not retain a previous request’s owner.

## 4. Verify isolation

Run the API test suite, then use two separate test accounts in separate browser profiles. Save a distinct memory as each account and verify each can list/search/delete only its own. Also verify conversation and message IDs from the other account return no data (or 404), including direct API requests with edited IDs. Check rejected inserts/updates that try to write another owner’s `owner_id`.

Keep the API suite and staging database checks as deployment gates. The migration covers memory and conversation content; other connector, approval, and settings tables still rely on the existing application-level owner filters and need their own RLS migration before claiming database-enforced isolation for all user data.

## Current status

The code and migration are prepared. The live Neon database has not been changed. Production enforcement remains off until a separate staging database and least-privilege runtime role are configured and verified.
