-- Phase 1: prevent accidental cross-organization joins even when a command
-- misses its repository scope.  The application service role is subject to
-- these guards just like every other database writer.
CREATE OR REPLACE FUNCTION assert_parent_organization(parent_table regclass, parent_id uuid, expected_organization_id uuid) RETURNS void AS $$
DECLARE actual_organization_id uuid;
BEGIN
  EXECUTE format('SELECT organization_id FROM %s WHERE id = $1', parent_table) INTO actual_organization_id USING parent_id;
  IF actual_organization_id IS NULL OR actual_organization_id <> expected_organization_id THEN
    RAISE EXCEPTION 'organization mismatch for %', parent_table;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION guard_project_membership_org() RETURNS trigger AS $$
BEGIN
  PERFORM assert_parent_organization('projects', NEW.project_id, NEW.organization_id);
  PERFORM assert_parent_organization('memberships', NEW.membership_id, NEW.organization_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER project_membership_organization_guard BEFORE INSERT OR UPDATE ON project_memberships FOR EACH ROW EXECUTE FUNCTION guard_project_membership_org();

CREATE OR REPLACE FUNCTION guard_task_assignee_org() RETURNS trigger AS $$
BEGIN
  PERFORM assert_parent_organization('tasks', NEW.task_id, NEW.organization_id);
  PERFORM assert_parent_organization('memberships', NEW.membership_id, NEW.organization_id);
  PERFORM assert_parent_organization('memberships', NEW.assigned_by_membership_id, NEW.organization_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER task_assignee_organization_guard BEFORE INSERT OR UPDATE ON task_assignees FOR EACH ROW EXECUTE FUNCTION guard_task_assignee_org();

CREATE OR REPLACE FUNCTION guard_upload_session_org() RETURNS trigger AS $$
BEGIN
  PERFORM assert_parent_organization('tasks', NEW.task_id, NEW.organization_id);
  PERFORM assert_parent_organization('memberships', NEW.uploader_membership_id, NEW.organization_id);
  IF NEW.file_asset_id IS NOT NULL THEN PERFORM assert_parent_organization('file_assets', NEW.file_asset_id, NEW.organization_id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER upload_session_organization_guard BEFORE INSERT OR UPDATE ON upload_sessions FOR EACH ROW EXECUTE FUNCTION guard_upload_session_org();

CREATE OR REPLACE FUNCTION guard_review_share_org() RETURNS trigger AS $$
BEGIN
  PERFORM assert_parent_organization('review_hubs', NEW.review_hub_id, NEW.organization_id);
  PERFORM assert_parent_organization('file_versions', NEW.file_version_id, NEW.organization_id);
  PERFORM assert_parent_organization('memberships', NEW.created_by_membership_id, NEW.organization_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER review_share_organization_guard BEFORE INSERT OR UPDATE ON review_shares FOR EACH ROW EXECUTE FUNCTION guard_review_share_org();

-- Retention execution remains intentionally unavailable. A worker may report
-- candidates, but no deployed migration grants a deletion procedure.
REVOKE DELETE ON audit_events, intake_items, intake_source_items, intake_attachments FROM PUBLIC;

-- A deactivation, demotion, expiry change, or deletion must never strand an
-- organization without an effective manager.
CREATE OR REPLACE FUNCTION ensure_effective_manager_remains() RETURNS trigger AS $$
DECLARE active_manager_count integer;
BEGIN
  IF OLD.role = 'MANAGER' AND OLD.status = 'ACTIVE' AND (OLD.expires_at IS NULL OR OLD.expires_at > now()) THEN
    IF TG_OP = 'DELETE' OR NEW.role <> 'MANAGER' OR NEW.status <> 'ACTIVE' OR (NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()) THEN
      SELECT count(*) INTO active_manager_count FROM memberships
        WHERE organization_id = OLD.organization_id AND role = 'MANAGER' AND status = 'ACTIVE'
          AND (expires_at IS NULL OR expires_at > now()) AND id <> OLD.id;
      IF active_manager_count = 0 THEN RAISE EXCEPTION 'At least one active manager must remain'; END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS final_manager_guard ON memberships;
CREATE TRIGGER final_manager_guard BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION ensure_effective_manager_remains();
CREATE TRIGGER final_manager_delete_guard BEFORE DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION ensure_effective_manager_remains();
