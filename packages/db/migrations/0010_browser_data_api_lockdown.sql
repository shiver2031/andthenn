-- The browser uses Supabase for authentication only. Operational access flows
-- through the application DAL and command services, so authenticated PostgREST
-- grants would create a parallel, organization-wide privilege boundary.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- A missing iat must never satisfy a session-revocation check. This function
-- remains useful to constrained roles and future read policies even though the
-- browser roles have no direct operational-table grants.
CREATE OR REPLACE FUNCTION current_actor_can_access_org(expected_organization_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN profiles p ON p.id = m.profile_id
    WHERE p.auth_user_id = auth.uid()
      AND m.organization_id = expected_organization_id
      AND m.status = 'ACTIVE'
      AND (m.starts_at IS NULL OR m.starts_at <= now())
      AND (m.expires_at IS NULL OR m.expires_at > now())
      AND (
        m.session_revoked_after IS NULL
        OR (
          auth.jwt() ->> 'iat' IS NOT NULL
          AND to_timestamp((auth.jwt() ->> 'iat')::numeric) > m.session_revoked_after
        )
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- These tables were introduced outside the original phase-two table list.
-- Explicitly enable RLS so future constrained role grants cannot expose them
-- accidentally; policies remain denied for browser roles until deliberately
-- designed and tested.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attempts ENABLE ROW LEVEL SECURITY;

-- Completion can be resumed after a process crash without treating an
-- in-progress request as abandoned immediately.
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS finalizing_at timestamptz;
