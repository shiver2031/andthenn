-- Phase 1 remediation: application-facing Supabase roles are constrained to
-- active memberships. Direct worker connections use their dedicated database
-- role and remain subject to command-level organization checks.
CREATE OR REPLACE FUNCTION current_actor_can_access_org(expected_organization_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    JOIN profiles p ON p.id = m.profile_id
    WHERE p.auth_user_id = auth.uid()
      AND m.organization_id = expected_organization_id
      AND m.status = 'ACTIVE'
      AND (m.starts_at IS NULL OR m.starts_at <= now())
      AND (m.expires_at IS NULL OR m.expires_at > now())
      AND (m.session_revoked_after IS NULL OR auth.jwt() ->> 'iat' IS NULL OR to_timestamp((auth.jwt() ->> 'iat')::numeric) > m.session_revoked_after)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- These are the directly browser-exposed organization resources. Every API
-- command also scopes queries, so service/worker access does not rely on RLS.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_settings','feature_flags','integration_connections','memberships','invites',
    'capacity_schedules','capacity_exceptions','clients','brands','contacts','contact_channels',
    'rate_cards','rate_items','intake_items','intake_source_items','intake_attachments',
    'intake_suggestions','proposals','projects','project_memberships','workflows','workflow_stages','deliverables','tasks','task_assignees',
    'task_dependencies','task_checklist_items','task_progress','internal_comments','time_entries',
    'time_entry_revisions','activity_events','file_assets','file_versions','upload_sessions',
    'file_approvals','review_hubs','review_shares','reviewer_sessions','review_comments',
    'quotes','quote_versions','invoice_records','notifications','notification_preferences',
    'notification_deliveries','saved_views','audit_events','outbox_events','webhook_receipts',
    'idempotency_keys','job_runs','archive_jobs','intake_conversions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS organization_member_access ON %I', table_name);
    EXECUTE format('CREATE POLICY organization_member_access ON %I FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id))', table_name);
  END LOOP;
END $$;

-- Phase 2 reusable templates and inert what-if planning scenarios.
CREATE TABLE project_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(200) NOT NULL,
  description text,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle record_lifecycle NOT NULL DEFAULT 'ACTIVE',
  created_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_pack_org_name_unique UNIQUE (organization_id, name)
);

CREATE TABLE planning_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  name varchar(200) NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  applied_at timestamptz,
  applied_by_membership_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planning_scenario_project_idx ON planning_scenarios(project_id, created_at);

ALTER TABLE project_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_member_access ON project_packs FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON planning_scenarios FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
