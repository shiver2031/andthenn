-- Historical approvals are not evidence of Client approval or publication.
ALTER TABLE file_approvals ADD COLUMN approval_kind text NOT NULL DEFAULT 'LEGACY_UNVERIFIED';
ALTER TABLE file_approvals ADD COLUMN approval_source text NOT NULL DEFAULT 'LEGACY';
ALTER TABLE file_approvals ADD COLUMN client_approver text;
ALTER TABLE file_approvals ADD COLUMN evidence_reference text;
ALTER TABLE file_approvals ADD CONSTRAINT file_approval_kind CHECK (approval_kind IN ('INTERNAL','CLIENT','LEGACY_UNVERIFIED'));
ALTER TABLE file_approvals ADD CONSTRAINT file_approval_source CHECK (approval_source IN ('INTERNAL','PORTAL','EMAIL','WHATSAPP','OTHER','LEGACY'));
ALTER TABLE file_approvals ADD CONSTRAINT client_approval_evidence CHECK (approval_kind <> 'CLIENT' OR (client_approver IS NOT NULL AND approval_source IN ('PORTAL','EMAIL','WHATSAPP','OTHER') AND (approval_source = 'PORTAL' OR (coalesce(length(trim(evidence_reference)),0) > 0 AND coalesce(length(trim(note)),0) > 0))));
DROP INDEX active_task_approval_unique;
CREATE UNIQUE INDEX active_task_approval_unique ON file_approvals(task_id, approval_kind) WHERE reopened_at IS NULL;
CREATE TABLE final_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 task_id uuid NOT NULL REFERENCES tasks(id),
 file_version_id uuid NOT NULL REFERENCES file_versions(id),
 client_approval_id uuid NOT NULL REFERENCES file_approvals(id),
 published_by_membership_id uuid NOT NULL REFERENCES memberships(id),
 published_at timestamptz NOT NULL DEFAULT now(),
 withdrawn_at timestamptz,
 withdrawn_by_membership_id uuid REFERENCES memberships(id),
 withdrawal_reason text,
 CHECK ((withdrawn_at IS NULL AND withdrawn_by_membership_id IS NULL AND withdrawal_reason IS NULL) OR (withdrawn_at IS NOT NULL AND withdrawn_by_membership_id IS NOT NULL AND coalesce(length(trim(withdrawal_reason)),0) >= 3))
);
CREATE UNIQUE INDEX active_task_delivery_unique ON final_deliveries(task_id) WHERE withdrawn_at IS NULL;
CREATE FUNCTION guard_final_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM assert_parent_organization('tasks', NEW.task_id, NEW.organization_id);
 PERFORM assert_parent_organization('file_versions', NEW.file_version_id, NEW.organization_id);
 PERFORM assert_parent_organization('file_approvals', NEW.client_approval_id, NEW.organization_id);
 PERFORM assert_parent_organization('memberships', NEW.published_by_membership_id, NEW.organization_id);
 IF NEW.withdrawn_by_membership_id IS NOT NULL THEN PERFORM assert_parent_organization('memberships', NEW.withdrawn_by_membership_id, NEW.organization_id); END IF;
 IF NOT EXISTS (SELECT 1 FROM file_approvals a WHERE a.id = NEW.client_approval_id AND a.task_id = NEW.task_id AND a.file_version_id = NEW.file_version_id AND a.approval_kind = 'CLIENT') THEN RAISE EXCEPTION 'Delivery must reference Client approval of this task version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER final_delivery_scope BEFORE INSERT OR UPDATE ON final_deliveries FOR EACH ROW EXECUTE FUNCTION guard_final_delivery();
ALTER TABLE final_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON final_deliveries FROM anon, authenticated;
-- 0012 tables must follow the existing application-server-only Data API policy.
REVOKE ALL ON client_memberships, internal_comment_mentions, task_review_selections, project_expenses FROM anon, authenticated;
CREATE VIEW current_final_files AS
 SELECT v.id AS file_version_id, d.task_id, d.organization_id, d.id AS delivery_id, d.published_at
 FROM final_deliveries d
 JOIN file_approvals a ON a.id = d.client_approval_id AND a.organization_id = d.organization_id AND a.task_id = d.task_id AND a.file_version_id = d.file_version_id
 JOIN file_versions v ON v.id = d.file_version_id AND v.organization_id = d.organization_id
 JOIN task_review_selections s ON s.task_id = d.task_id AND s.file_version_id = v.id AND s.organization_id = d.organization_id
 WHERE d.withdrawn_at IS NULL AND a.reopened_at IS NULL AND a.approval_kind = 'CLIENT' AND v.processing_status = 'READY' AND v.locked_at IS NOT NULL;
REVOKE ALL ON current_final_files FROM anon, authenticated;
CREATE VIEW approval_reconciliation_queue AS SELECT * FROM file_approvals WHERE approval_kind = 'LEGACY_UNVERIFIED';
REVOKE ALL ON approval_reconciliation_queue FROM anon, authenticated;

ALTER TABLE internal_comments ADD COLUMN file_version_id uuid REFERENCES file_versions(id);
ALTER TABLE internal_comments ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX internal_comment_request_unique ON internal_comments(author_membership_id, request_id) WHERE request_id IS NOT NULL;

ALTER TABLE tasks ADD COLUMN completion_delegate_membership_id uuid REFERENCES memberships(id);
CREATE FUNCTION guard_discussion_and_delegate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'tasks' THEN
  IF NEW.completion_delegate_membership_id IS NOT NULL THEN PERFORM assert_parent_organization('memberships', NEW.completion_delegate_membership_id, NEW.organization_id); END IF;
 ELSE
  IF NEW.file_version_id IS NOT NULL THEN
   PERFORM assert_parent_organization('file_versions', NEW.file_version_id, NEW.organization_id);
   IF NEW.task_id IS NULL OR NOT EXISTS (SELECT 1 FROM file_versions v JOIN file_assets a ON a.id=v.file_asset_id WHERE v.id=NEW.file_version_id AND a.task_id=NEW.task_id) THEN RAISE EXCEPTION 'Feedback version must belong to the task'; END IF;
  END IF;
  IF NEW.parent_comment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM internal_comments p WHERE p.id=NEW.parent_comment_id AND p.organization_id=NEW.organization_id AND p.task_id IS NOT DISTINCT FROM NEW.task_id AND p.project_id IS NOT DISTINCT FROM NEW.project_id) THEN RAISE EXCEPTION 'Reply must belong to the same discussion'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER discussion_relationship_scope BEFORE INSERT OR UPDATE ON internal_comments FOR EACH ROW EXECUTE FUNCTION guard_discussion_and_delegate();
CREATE TRIGGER completion_delegate_scope BEFORE INSERT OR UPDATE OF completion_delegate_membership_id ON tasks FOR EACH ROW EXECUTE FUNCTION guard_discussion_and_delegate();

--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN requires_client_delivery boolean NOT NULL DEFAULT false;
UPDATE tasks t SET requires_client_delivery=true WHERE EXISTS (SELECT 1 FROM file_assets f WHERE f.task_id=t.id);
