ALTER TABLE file_versions
  ADD COLUMN detected_content_type varchar(180),
  ADD COLUMN malware_status varchar(40) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN processing_failure_detail text,
  ADD COLUMN ready_at timestamptz;

ALTER TABLE upload_sessions
  ADD COLUMN upload_mode varchar(20) NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN expected_part_count integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT upload_session_part_count_positive CHECK (expected_part_count > 0);

ALTER TABLE review_shares ADD COLUMN delivery_channel notification_channel;

CREATE TABLE review_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  review_share_id uuid NOT NULL REFERENCES review_shares(id),
  reviewer_session_id uuid REFERENCES reviewer_sessions(id),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  ip_hash varchar(64),
  user_agent text
);
CREATE INDEX review_view_share_time_idx ON review_view_events(review_share_id, viewed_at);

CREATE TABLE review_comment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  review_comment_id uuid NOT NULL REFERENCES review_comments(id),
  actor_membership_id uuid REFERENCES memberships(id),
  action varchar(40) NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_comment_revision_idx ON review_comment_revisions(review_comment_id, created_at);

CREATE TABLE asset_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  file_asset_id uuid NOT NULL REFERENCES file_assets(id),
  kind varchar(60) NOT NULL,
  territory varchar(240) NOT NULL,
  channels text[] NOT NULL DEFAULT ARRAY[]::text[],
  valid_from date,
  valid_until date,
  document_file_version_id uuid REFERENCES file_versions(id),
  notes text,
  created_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_right_date_order CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX asset_right_expiry_idx ON asset_rights(organization_id, valid_until);

-- New organization-owned tables use the same authenticated membership boundary.
ALTER TABLE review_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_comment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_member_access ON review_view_events FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON review_comment_revisions FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON asset_rights FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));

CREATE OR REPLACE FUNCTION guard_phase4_relationship_org() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'review_view_events' THEN
    PERFORM assert_parent_organization('review_shares', NEW.review_share_id, NEW.organization_id);
    IF NEW.reviewer_session_id IS NOT NULL THEN PERFORM assert_parent_organization('reviewer_sessions', NEW.reviewer_session_id, NEW.organization_id); END IF;
  ELSIF TG_TABLE_NAME = 'review_comment_revisions' THEN
    PERFORM assert_parent_organization('review_comments', NEW.review_comment_id, NEW.organization_id);
    IF NEW.actor_membership_id IS NOT NULL THEN PERFORM assert_parent_organization('memberships', NEW.actor_membership_id, NEW.organization_id); END IF;
  ELSIF TG_TABLE_NAME = 'asset_rights' THEN
    PERFORM assert_parent_organization('file_assets', NEW.file_asset_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.created_by_membership_id, NEW.organization_id);
    IF NEW.document_file_version_id IS NOT NULL THEN PERFORM assert_parent_organization('file_versions', NEW.document_file_version_id, NEW.organization_id); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER review_view_event_org_guard BEFORE INSERT OR UPDATE ON review_view_events FOR EACH ROW EXECUTE FUNCTION guard_phase4_relationship_org();
CREATE TRIGGER review_comment_revision_org_guard BEFORE INSERT OR UPDATE ON review_comment_revisions FOR EACH ROW EXECUTE FUNCTION guard_phase4_relationship_org();
CREATE TRIGGER asset_right_org_guard BEFORE INSERT OR UPDATE ON asset_rights FOR EACH ROW EXECUTE FUNCTION guard_phase4_relationship_org();

-- A share must pin a ready version owned by the same task as its review hub.
CREATE OR REPLACE FUNCTION enforce_review_share_version_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM review_hubs h
    JOIN file_assets a ON a.task_id = h.task_id AND a.organization_id = h.organization_id
    JOIN file_versions v ON v.file_asset_id = a.id AND v.organization_id = a.organization_id
    WHERE h.id = NEW.review_hub_id AND v.id = NEW.file_version_id
      AND h.organization_id = NEW.organization_id AND v.processing_status = 'READY'
  ) THEN RAISE EXCEPTION 'Review share version must be ready and belong to the review task'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER review_share_version_scope BEFORE INSERT OR UPDATE OF review_hub_id, file_version_id, organization_id ON review_shares FOR EACH ROW EXECUTE FUNCTION enforce_review_share_version_scope();

-- Approved/locked versions are immutable. Administrative reopening clears the
-- approval but never mutates the original version bytes or metadata.
CREATE OR REPLACE FUNCTION protect_locked_file_version() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN RAISE EXCEPTION 'Approved file versions are immutable'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER locked_file_version_update BEFORE UPDATE ON file_versions FOR EACH ROW WHEN (OLD.locked_at IS NOT NULL) EXECUTE FUNCTION protect_locked_file_version();
CREATE TRIGGER locked_file_version_delete BEFORE DELETE ON file_versions FOR EACH ROW WHEN (OLD.locked_at IS NOT NULL) EXECUTE FUNCTION protect_locked_file_version();

CREATE OR REPLACE FUNCTION guard_file_approval_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM file_versions v JOIN file_assets a ON a.id = v.file_asset_id
    WHERE v.id = NEW.file_version_id AND a.task_id = NEW.task_id
      AND v.organization_id = NEW.organization_id AND a.organization_id = NEW.organization_id
      AND v.processing_status = 'READY'
  ) THEN RAISE EXCEPTION 'Approval version must be ready and belong to the task'; END IF;
  PERFORM assert_parent_organization('memberships', NEW.approved_by_membership_id, NEW.organization_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER file_approval_scope BEFORE INSERT OR UPDATE ON file_approvals FOR EACH ROW EXECUTE FUNCTION guard_file_approval_scope();
