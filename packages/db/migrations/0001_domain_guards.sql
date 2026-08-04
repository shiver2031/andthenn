-- Domain invariants layered after the generated relational schema.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgmq;

CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER time_entry_revisions_append_only
BEFORE UPDATE OR DELETE ON time_entry_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER job_attempts_append_only
BEFORE UPDATE OR DELETE ON job_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE OR REPLACE FUNCTION protect_file_version_identity() RETURNS trigger AS $$
BEGIN
  IF OLD.file_asset_id <> NEW.file_asset_id
     OR OLD.version_number <> NEW.version_number
     OR OLD.storage_provider <> NEW.storage_provider
     OR OLD.storage_key <> NEW.storage_key
     OR OLD.checksum_sha256 <> NEW.checksum_sha256
     OR OLD.size_bytes <> NEW.size_bytes THEN
    RAISE EXCEPTION 'File version identity and bytes are immutable';
  END IF;
  IF OLD.locked_at IS NOT NULL AND (
    NEW.locked_at IS DISTINCT FROM OLD.locked_at OR
    NEW.locked_reason IS DISTINCT FROM OLD.locked_reason
  ) THEN
    RAISE EXCEPTION 'Approved file version lock is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER file_version_identity_immutable
BEFORE UPDATE ON file_versions
FOR EACH ROW EXECUTE FUNCTION protect_file_version_identity();

CREATE OR REPLACE FUNCTION protect_review_share_pin() RETURNS trigger AS $$
BEGIN
  IF OLD.review_hub_id <> NEW.review_hub_id OR OLD.file_version_id <> NEW.file_version_id OR OLD.token_hash <> NEW.token_hash THEN
    RAISE EXCEPTION 'Review shares are immutable and version-pinned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_share_pin_immutable
BEFORE UPDATE ON review_shares
FOR EACH ROW EXECUTE FUNCTION protect_review_share_pin();

CREATE OR REPLACE FUNCTION protect_deliverable_project() RETURNS trigger AS $$
BEGIN
  IF OLD.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'Deliverable project lineage requires controlled migration';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deliverable_project_immutable
BEFORE UPDATE ON deliverables
FOR EACH ROW EXECUTE FUNCTION protect_deliverable_project();

CREATE OR REPLACE FUNCTION ensure_active_manager_remains() RETURNS trigger AS $$
DECLARE active_manager_count integer;
BEGIN
  IF OLD.role = 'MANAGER' AND OLD.status = 'ACTIVE' AND (NEW.role <> 'MANAGER' OR NEW.status <> 'ACTIVE') THEN
    SELECT count(*) INTO active_manager_count FROM memberships
      WHERE organization_id = OLD.organization_id AND role = 'MANAGER' AND status = 'ACTIVE' AND id <> OLD.id;
    IF active_manager_count = 0 THEN
      RAISE EXCEPTION 'At least one active manager must remain';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER final_manager_guard
BEFORE UPDATE ON memberships
FOR EACH ROW EXECUTE FUNCTION ensure_active_manager_remains();

CREATE INDEX IF NOT EXISTS client_name_trgm_idx ON clients USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS project_name_trgm_idx ON projects USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS task_name_trgm_idx ON tasks USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS intake_search_idx ON intake_items USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(confirmed_summary, '')));

SELECT pgmq.create('default');
SELECT pgmq.create('intake');
SELECT pgmq.create('media');
SELECT pgmq.create('integrations');
SELECT pgmq.create('notifications');
SELECT pgmq.create('retention');
SELECT pgmq.create('archive');
SELECT pgmq.create('failed_jobs');
