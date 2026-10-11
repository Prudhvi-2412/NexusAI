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
