CREATE TABLE calendar_sync_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  integration_connection_id uuid NOT NULL REFERENCES integration_connections(id),
  object_type varchar(80) NOT NULL,
  object_id uuid NOT NULL,
  external_event_id text,
  source_version integer NOT NULL DEFAULT 1,
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  last_synced_at timestamptz,
  failure_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_connection_id, object_type, object_id)
);
CREATE INDEX calendar_sync_status_idx ON calendar_sync_records(organization_id, status, updated_at);
ALTER TABLE calendar_sync_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_member_access ON calendar_sync_records FOR ALL TO authenticated USING (current_actor_can_access_org(organization_id)) WITH CHECK (current_actor_can_access_org(organization_id));
CREATE OR REPLACE FUNCTION guard_calendar_sync_org() RETURNS trigger AS $$
BEGIN
  PERFORM assert_parent_organization('integration_connections', NEW.integration_connection_id, NEW.organization_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER calendar_sync_org_guard BEFORE INSERT OR UPDATE ON calendar_sync_records FOR EACH ROW EXECUTE FUNCTION guard_calendar_sync_org();

-- Phase 5 carry-forward: never allow two versions to claim the same revision number.
CREATE UNIQUE INDEX IF NOT EXISTS quote_version_number_unique ON quote_versions(quote_id, version_number);
