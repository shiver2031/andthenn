ALTER TABLE projects ADD COLUMN budget_notes text;
ALTER TABLE upload_sessions
  ADD COLUMN provider_object_key text,
  ADD COLUMN provider_etag text;
ALTER TABLE quote_versions
  ADD COLUMN pdf_checksum_sha256 varchar(64),
  ADD COLUMN legal_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN published_at timestamptz;
ALTER TABLE quote_lines ADD COLUMN override_reason text;

ALTER TABLE quote_versions ADD CONSTRAINT quote_version_totals_nonnegative
  CHECK (subtotal_minor >= 0 AND discount_minor >= 0 AND tax_minor >= 0 AND total_minor >= 0);
ALTER TABLE quote_lines ADD CONSTRAINT quote_line_values_valid
  CHECK (unit_rate_minor >= 0 AND discount_basis_points BETWEEN 0 AND 10000 AND tax_basis_points BETWEEN 0 AND 10000 AND line_total_minor >= 0);

CREATE TABLE quote_acceptance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  quote_version_id uuid NOT NULL REFERENCES quote_versions(id),
  token_hash varchar(64) NOT NULL UNIQUE,
  status varchar(40) NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz,
  created_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_name varchar(160),
  accepted_email varchar(320),
  accepted_ip_hash varchar(64),
  accepted_user_agent text,
  evidence_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_acceptance_state_shape CHECK (
    (status = 'ACCEPTED' AND accepted_at IS NOT NULL AND accepted_name IS NOT NULL AND accepted_email IS NOT NULL AND evidence_snapshot IS NOT NULL)
    OR (status <> 'ACCEPTED' AND accepted_at IS NULL)
  )
);
CREATE INDEX quote_acceptance_version_status_idx ON quote_acceptance_links(quote_version_id, status);

CREATE TABLE quote_acceptance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  acceptance_link_id uuid NOT NULL REFERENCES quote_acceptance_links(id),
  event_type varchar(40) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_acceptance_event_idx ON quote_acceptance_events(acceptance_link_id, created_at);

CREATE TABLE invoice_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  invoice_record_id uuid NOT NULL REFERENCES invoice_records(id),
  actor_membership_id uuid NOT NULL REFERENCES memberships(id),
  before jsonb,
  after jsonb NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_revision_idx ON invoice_revisions(invoice_record_id, created_at);

CREATE TABLE archive_manifest_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  archive_job_id uuid NOT NULL REFERENCES archive_jobs(id),
  file_version_id uuid NOT NULL REFERENCES file_versions(id),
  source_storage_key text NOT NULL,
  destination_storage_key text NOT NULL,
  expected_checksum_sha256 varchar(64) NOT NULL,
  verified_checksum_sha256 varchar(64),
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  failure_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (archive_job_id, file_version_id)
);
CREATE INDEX archive_job_project_idx ON archive_jobs(project_id, created_at);

CREATE TABLE project_closure_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  key varchar(80) NOT NULL,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  completed_at timestamptz,
  completed_by_membership_id uuid REFERENCES memberships(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

CREATE TABLE project_closure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  actor_membership_id uuid NOT NULL REFERENCES memberships(id),
  action varchar(40) NOT NULL,
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_closure_event_idx ON project_closure_events(project_id, created_at);

CREATE TABLE project_retrospectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id) UNIQUE,
  estimate_minutes integer NOT NULL DEFAULT 0,
  actual_minutes integer NOT NULL DEFAULT 0,
  deadline_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  bottleneck_summary text NOT NULL DEFAULT '',
  lessons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  approved_at timestamptz,
  approved_by_membership_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (estimate_minutes >= 0 AND actual_minutes >= 0)
);

CREATE TABLE template_improvement_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  retrospective_id uuid NOT NULL REFERENCES project_retrospectives(id),
  project_pack_id uuid REFERENCES project_packs(id),
  suggestion text NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'PROPOSED',
  decided_at timestamptz,
  decided_by_membership_id uuid REFERENCES memberships(id),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX template_suggestion_retro_idx ON template_improvement_suggestions(retrospective_id, status);

ALTER TABLE quote_acceptance_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_acceptance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_manifest_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_closure_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_closure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_retrospectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_improvement_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_member_access ON quote_acceptance_links FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON quote_acceptance_events FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON invoice_revisions FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON archive_manifest_entries FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON project_closure_checklist_items FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON project_closure_events FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON project_retrospectives FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON template_improvement_suggestions FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));

CREATE OR REPLACE FUNCTION guard_phase5_relationship_org() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'quote_acceptance_links' THEN
    PERFORM assert_parent_organization('quote_versions', NEW.quote_version_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.created_by_membership_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'quote_acceptance_events' THEN
    PERFORM assert_parent_organization('quote_acceptance_links', NEW.acceptance_link_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'invoice_revisions' THEN
    PERFORM assert_parent_organization('invoice_records', NEW.invoice_record_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.actor_membership_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'archive_manifest_entries' THEN
    PERFORM assert_parent_organization('archive_jobs', NEW.archive_job_id, NEW.organization_id);
    PERFORM assert_parent_organization('file_versions', NEW.file_version_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'project_closure_checklist_items' THEN
    PERFORM assert_parent_organization('projects', NEW.project_id, NEW.organization_id);
    IF NEW.completed_by_membership_id IS NOT NULL THEN PERFORM assert_parent_organization('memberships', NEW.completed_by_membership_id, NEW.organization_id); END IF;
  ELSIF TG_TABLE_NAME = 'project_closure_events' THEN
    PERFORM assert_parent_organization('projects', NEW.project_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.actor_membership_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'project_retrospectives' THEN
    PERFORM assert_parent_organization('projects', NEW.project_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.created_by_membership_id, NEW.organization_id);
    IF NEW.approved_by_membership_id IS NOT NULL THEN PERFORM assert_parent_organization('memberships', NEW.approved_by_membership_id, NEW.organization_id); END IF;
  ELSIF TG_TABLE_NAME = 'template_improvement_suggestions' THEN
    PERFORM assert_parent_organization('project_retrospectives', NEW.retrospective_id, NEW.organization_id);
    IF NEW.project_pack_id IS NOT NULL THEN PERFORM assert_parent_organization('project_packs', NEW.project_pack_id, NEW.organization_id); END IF;
    IF NEW.decided_by_membership_id IS NOT NULL THEN PERFORM assert_parent_organization('memberships', NEW.decided_by_membership_id, NEW.organization_id); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_acceptance_link_org_guard BEFORE INSERT OR UPDATE ON quote_acceptance_links FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();
CREATE TRIGGER quote_acceptance_event_org_guard BEFORE INSERT OR UPDATE ON quote_acceptance_events FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();
CREATE TRIGGER invoice_revision_org_guard BEFORE INSERT OR UPDATE ON invoice_revisions FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();
CREATE TRIGGER archive_manifest_entry_org_guard BEFORE INSERT OR UPDATE ON archive_manifest_entries FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();
CREATE TRIGGER project_closure_checklist_org_guard BEFORE INSERT OR UPDATE ON project_closure_checklist_items FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();
CREATE TRIGGER project_closure_event_org_guard BEFORE INSERT OR UPDATE ON project_closure_events FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();
CREATE TRIGGER project_retrospective_org_guard BEFORE INSERT OR UPDATE ON project_retrospectives FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();
CREATE TRIGGER template_suggestion_org_guard BEFORE INSERT OR UPDATE ON template_improvement_suggestions FOR EACH ROW EXECUTE FUNCTION guard_phase5_relationship_org();

-- A finalized quotation version is immutable evidence. Acceptance rows remain append-only.
CREATE OR REPLACE FUNCTION protect_finalized_quote_version() RETURNS trigger AS $$
BEGIN
  IF OLD.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Finalized quotation versions are immutable'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER finalized_quote_version_update BEFORE UPDATE ON quote_versions FOR EACH ROW WHEN (OLD.finalized_at IS NOT NULL) EXECUTE FUNCTION protect_finalized_quote_version();
CREATE TRIGGER finalized_quote_version_delete BEFORE DELETE ON quote_versions FOR EACH ROW WHEN (OLD.finalized_at IS NOT NULL) EXECUTE FUNCTION protect_finalized_quote_version();
CREATE OR REPLACE FUNCTION protect_finalized_quote_lines() RETURNS trigger AS $$
DECLARE target_version_id uuid;
BEGIN
  target_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.quote_version_id ELSE NEW.quote_version_id END;
  IF EXISTS (SELECT 1 FROM quote_versions WHERE id = target_version_id AND finalized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Finalized quotation lines are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER finalized_quote_line_update BEFORE UPDATE OR DELETE ON quote_lines FOR EACH ROW EXECUTE FUNCTION protect_finalized_quote_lines();
