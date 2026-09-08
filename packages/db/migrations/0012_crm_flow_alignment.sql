ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'FOUNDER';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'DESIGNER';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'CLIENT';

-- Universal project-scoped assignment deliberately does not require the
-- recipient to hold a project grant. A grant controls what someone may browse;
-- accepting a task assignment is itself the narrow work-access boundary.
CREATE OR REPLACE FUNCTION enforce_task_assignee_scope() RETURNS trigger AS $$
BEGIN
  IF NEW.removed_at IS NULL AND NOT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.id = NEW.membership_id
      AND m.organization_id = NEW.organization_id
      AND m.status = 'ACTIVE'
      AND m.role <> 'CLIENT'
      AND (m.expires_at IS NULL OR m.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Task assignee must be an active internal organization member';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE task_execution_status AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
  'BLOCKED',
  'COMPLETED'
);

ALTER TABLE tasks
  ADD COLUMN execution_status task_execution_status NOT NULL DEFAULT 'OPEN',
  ADD COLUMN completion_requested_at timestamptz,
  ADD COLUMN completion_requested_by_membership_id uuid REFERENCES memberships(id),
  ADD COLUMN completion_reviewer_membership_id uuid REFERENCES memberships(id),
  ADD COLUMN completion_confirmed_at timestamptz,
  ADD COLUMN completion_confirmed_by_membership_id uuid REFERENCES memberships(id),
  ADD CONSTRAINT task_completion_request_shape CHECK (
    num_nonnulls(
      completion_requested_at,
      completion_requested_by_membership_id,
      completion_reviewer_membership_id
    ) IN (0, 3)
  ),
  ADD CONSTRAINT task_completion_confirmation_shape CHECK (
    num_nonnulls(completion_confirmed_at, completion_confirmed_by_membership_id) IN (0, 2)
    AND (completion_confirmed_at IS NULL OR completion_requested_at IS NOT NULL)
    AND (completion_confirmed_at IS NULL OR completion_confirmed_at >= completion_requested_at)
  );

UPDATE tasks
SET execution_status = CASE
  WHEN state_kind = 'COMPLETED' THEN 'COMPLETED'::task_execution_status
  ELSE 'OPEN'::task_execution_status
END;

DROP INDEX IF EXISTS task_state_idx;
CREATE INDEX task_state_idx ON tasks(organization_id, execution_status, due_at);

CREATE TABLE client_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, membership_id)
);
CREATE INDEX client_membership_member_idx ON client_memberships(membership_id);

CREATE TABLE internal_comment_mentions (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  comment_id uuid NOT NULL REFERENCES internal_comments(id) ON DELETE CASCADE,
  mentioned_membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, mentioned_membership_id)
);
CREATE INDEX internal_comment_mention_member_idx
  ON internal_comment_mentions(mentioned_membership_id, created_at);

CREATE TABLE task_review_selections (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  file_version_id uuid NOT NULL REFERENCES file_versions(id),
  selected_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  selected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_review_selection_version_idx
  ON task_review_selections(file_version_id);

CREATE TABLE project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency varchar(3) NOT NULL DEFAULT 'INR',
  category varchar(120) NOT NULL,
  incurred_on date NOT NULL,
  note text,
  created_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_expense_project_date_idx
  ON project_expenses(project_id, incurred_on);

-- Every CRM relation must preserve the tenant of each parent. Foreign keys on
-- UUIDs alone cannot prevent a valid ID from another organization being used.
CREATE OR REPLACE FUNCTION guard_crm_flow_relationship_org() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'client_memberships' THEN
    PERFORM assert_parent_organization('clients', NEW.client_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.membership_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'internal_comment_mentions' THEN
    PERFORM assert_parent_organization('internal_comments', NEW.comment_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.mentioned_membership_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'task_review_selections' THEN
    PERFORM assert_parent_organization('tasks', NEW.task_id, NEW.organization_id);
    PERFORM assert_parent_organization('file_versions', NEW.file_version_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.selected_by_membership_id, NEW.organization_id);
    IF NOT EXISTS (
      SELECT 1 FROM file_versions v
      JOIN file_assets a ON a.id = v.file_asset_id
      WHERE v.id = NEW.file_version_id AND a.task_id = NEW.task_id
        AND v.organization_id = NEW.organization_id
        AND a.organization_id = NEW.organization_id
        AND v.processing_status = 'READY'
    ) THEN RAISE EXCEPTION 'Review selection version must be ready and belong to the task'; END IF;
  ELSIF TG_TABLE_NAME = 'project_expenses' THEN
    PERFORM assert_parent_organization('projects', NEW.project_id, NEW.organization_id);
    PERFORM assert_parent_organization('memberships', NEW.created_by_membership_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'tasks' THEN
    IF NEW.completion_requested_by_membership_id IS NOT NULL THEN
      PERFORM assert_parent_organization('memberships', NEW.completion_requested_by_membership_id, NEW.organization_id);
      PERFORM assert_parent_organization('memberships', NEW.completion_reviewer_membership_id, NEW.organization_id);
    END IF;
    IF NEW.completion_confirmed_by_membership_id IS NOT NULL THEN
      PERFORM assert_parent_organization('memberships', NEW.completion_confirmed_by_membership_id, NEW.organization_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_membership_org_guard BEFORE INSERT OR UPDATE ON client_memberships FOR EACH ROW EXECUTE FUNCTION guard_crm_flow_relationship_org();
CREATE TRIGGER internal_comment_mention_org_guard BEFORE INSERT OR UPDATE ON internal_comment_mentions FOR EACH ROW EXECUTE FUNCTION guard_crm_flow_relationship_org();
CREATE TRIGGER task_review_selection_org_guard BEFORE INSERT OR UPDATE ON task_review_selections FOR EACH ROW EXECUTE FUNCTION guard_crm_flow_relationship_org();
CREATE TRIGGER project_expense_org_guard BEFORE INSERT OR UPDATE ON project_expenses FOR EACH ROW EXECUTE FUNCTION guard_crm_flow_relationship_org();
CREATE TRIGGER task_completion_org_guard BEFORE INSERT OR UPDATE OF completion_requested_by_membership_id, completion_reviewer_membership_id, completion_confirmed_by_membership_id, organization_id ON tasks FOR EACH ROW EXECUTE FUNCTION guard_crm_flow_relationship_org();

ALTER TABLE client_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_review_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_member_access ON client_memberships
  FOR ALL TO authenticated
  USING (current_actor_can_access_org(organization_id))
  WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON internal_comment_mentions
  FOR ALL TO authenticated
  USING (current_actor_can_access_org(organization_id))
  WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON task_review_selections
  FOR ALL TO authenticated
  USING (current_actor_can_access_org(organization_id))
  WITH CHECK (current_actor_can_access_org(organization_id));
CREATE POLICY organization_member_access ON project_expenses
  FOR ALL TO authenticated
  USING (current_actor_can_access_org(organization_id))
  WITH CHECK (current_actor_can_access_org(organization_id));
