-- Apply with a Neon admin/migration role after creating the nexusai_app role.
-- The API runtime role must be NOSUPERUSER and NOBYPASSRLS.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexusai_app') THEN
        RAISE EXCEPTION 'Create the nexusai_app runtime role before applying this migration';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'nexusai_app' AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'nexusai_app must be NOSUPERUSER and NOBYPASSRLS';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO nexusai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexusai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexusai_app;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.conversations WHERE owner_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.memories WHERE owner_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.memory_suggestions WHERE owner_id IS NULL) THEN
        RAISE EXCEPTION 'Backfill owner_id on legacy tenant rows before enabling RLS';
    END IF;
    IF EXISTS (SELECT 1 FROM public.google_credentials WHERE owner_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.auth_sessions WHERE owner_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.telegram_conversations WHERE owner_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.oauth_states
                  WHERE owner_id IS NULL AND NOT (integration_id = 'auth' AND flow = 'login')) THEN
        RAISE EXCEPTION 'Resolve unowned credentials, sessions, Telegram links, and OAuth states before enabling RLS';
    END IF;
END $$;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nexusai_owner_isolation ON public.conversations;
CREATE POLICY nexusai_owner_isolation ON public.conversations
    TO nexusai_app
    USING (owner_id = nullif(current_setting('nexusai.owner_id', true), ''))
    WITH CHECK (owner_id = nullif(current_setting('nexusai.owner_id', true), ''));

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nexusai_owner_isolation ON public.messages;
CREATE POLICY nexusai_owner_isolation ON public.messages
    TO nexusai_app
    USING (EXISTS (
        SELECT 1 FROM public.conversations AS c
        WHERE c.id = messages.conversation_id
          AND c.owner_id = nullif(current_setting('nexusai.owner_id', true), '')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.conversations AS c
        WHERE c.id = messages.conversation_id
          AND c.owner_id = nullif(current_setting('nexusai.owner_id', true), '')
    ));

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nexusai_owner_isolation ON public.memories;
CREATE POLICY nexusai_owner_isolation ON public.memories
    TO nexusai_app
    USING (owner_id = nullif(current_setting('nexusai.owner_id', true), ''))
    WITH CHECK (owner_id = nullif(current_setting('nexusai.owner_id', true), ''));

ALTER TABLE public.memory_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_suggestions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nexusai_owner_isolation ON public.memory_suggestions;
CREATE POLICY nexusai_owner_isolation ON public.memory_suggestions
    TO nexusai_app
    USING (owner_id = nullif(current_setting('nexusai.owner_id', true), ''))
    WITH CHECK (owner_id = nullif(current_setting('nexusai.owner_id', true), ''));

-- Browser session state and MCP bearer tokens are account secrets.
ALTER TABLE public.browser_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_sites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nexusai_owner_isolation ON public.browser_sites;
CREATE POLICY nexusai_owner_isolation ON public.browser_sites
    TO nexusai_app
    USING (owner_id = nullif(current_setting('nexusai.owner_id', true), ''))
    WITH CHECK (owner_id = nullif(current_setting('nexusai.owner_id', true), ''));

ALTER TABLE public.user_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mcp_servers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nexusai_owner_isolation ON public.user_mcp_servers;
CREATE POLICY nexusai_owner_isolation ON public.user_mcp_servers
    TO nexusai_app
    USING (owner_id = nullif(current_setting('nexusai.owner_id', true), ''))
    WITH CHECK (owner_id = nullif(current_setting('nexusai.owner_id', true), ''));

-- All remaining account-owned records use the same transaction-local owner.
-- The only exceptions are exact bearer lookups needed before account binding,
-- and narrowly scoped scheduler reads needed by the trusted background worker.
DO $$
DECLARE
    table_name text;
    access_rule text;
    tenant_tables text[] := ARRAY[
        'google_credentials', 'github_credentials', 'linkedin_credentials',
        'instagram_credentials', 'auth_sessions', 'oauth_states',
        'telegram_conversations', 'telegram_link_codes', 'agent_runs',
        'scheduled_tasks', 'approval_requests', 'user_settings'
    ];
BEGIN
    FOREACH table_name IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('DROP POLICY IF EXISTS nexusai_owner_isolation ON public.%I', table_name);
        access_rule := 'owner_id = nullif(current_setting(''nexusai.owner_id'', true), '''')';
        IF table_name IN ('scheduled_tasks', 'approval_requests', 'user_settings') THEN
            access_rule := access_rule || ' OR current_setting(''nexusai.scheduler'', true) = ''on''';
        ELSIF table_name = 'auth_sessions' THEN
            access_rule := access_rule || ' OR token_hash = nullif(current_setting(''nexusai.session_hash'', true), '''')';
        ELSIF table_name = 'oauth_states' THEN
            access_rule := access_rule || ' OR (state = nullif(current_setting(''nexusai.oauth_state'', true), '''') AND (owner_id IS NOT NULL OR (integration_id = ''auth'' AND flow = ''login'')))';
        ELSIF table_name = 'telegram_conversations' THEN
            access_rule := access_rule || ' OR user_id = nullif(current_setting(''nexusai.telegram_user_id'', true), '''')';
        ELSIF table_name = 'telegram_link_codes' THEN
            access_rule := access_rule || ' OR code_hash = nullif(current_setting(''nexusai.telegram_link_code'', true), '''')';
        END IF;
        EXECUTE format('CREATE POLICY nexusai_owner_isolation ON public.%I TO nexusai_app USING (%s) WITH CHECK (%s)',
                       table_name, access_rule, access_rule);
    END LOOP;
END $$;

-- Checkpoint payloads can contain prompts, connector results, and approval data.
-- Their thread IDs must resolve to a run or an approval owned by this account.
DO $$
DECLARE
    table_name text;
    checkpoint_tables text[] := ARRAY['checkpoints', 'checkpoint_blobs', 'checkpoint_writes'];
    thread_rule text;
BEGIN
    FOREACH table_name IN ARRAY checkpoint_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('DROP POLICY IF EXISTS nexusai_owner_isolation ON public.%I', table_name);
        thread_rule := '(current_setting(''nexusai.owner_id'', true) IS NOT NULL AND ('
            || 'EXISTS (SELECT 1 FROM public.agent_runs AS r WHERE r.id = thread_id AND r.owner_id = current_setting(''nexusai.owner_id'', true)) '
            || 'OR EXISTS (SELECT 1 FROM public.approval_requests AS a WHERE a.id = thread_id AND a.owner_id = current_setting(''nexusai.owner_id'', true))))';
        EXECUTE format('CREATE POLICY nexusai_owner_isolation ON public.%I TO nexusai_app USING (%s) WITH CHECK (%s)',
                       table_name, thread_rule, thread_rule);
    END LOOP;
END $$;

-- New tables created by the migration role receive the API's normal CRUD grants.
DO $$
BEGIN
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexusai_app',
        current_user
    );
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nexusai_app',
        current_user
    );
END $$;

COMMIT;
