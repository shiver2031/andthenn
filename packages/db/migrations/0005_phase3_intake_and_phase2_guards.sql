-- Phase 2 carry-forward: a task may have only one currently-active primary owner.
CREATE UNIQUE INDEX active_task_primary_owner_unique
  ON task_assignees (task_id) WHERE kind = 'PRIMARY' AND removed_at IS NULL;

-- A workflow stage is meaningful only inside the task's deliverable/project workflow.
CREATE OR REPLACE FUNCTION enforce_task_workflow_stage_scope() RETURNS trigger AS $$
BEGIN
  IF NEW.current_workflow_stage_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM deliverables d
    JOIN workflows w ON w.project_id = d.project_id AND w.organization_id = d.organization_id
    JOIN workflow_stages s ON s.workflow_id = w.id AND s.organization_id = w.organization_id
    WHERE d.id = NEW.deliverable_id
      AND d.organization_id = NEW.organization_id
      AND s.id = NEW.current_workflow_stage_id
  ) THEN RAISE EXCEPTION 'Task workflow stage must belong to its deliverable project workflow'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_workflow_stage_scope
BEFORE INSERT OR UPDATE OF deliverable_id, current_workflow_stage_id, organization_id ON tasks
FOR EACH ROW EXECUTE FUNCTION enforce_task_workflow_stage_scope();

-- Assignment identities must be active in the task project, either as project owner
-- or through an active project membership; this stops cross-project assignment IDs.
CREATE OR REPLACE FUNCTION enforce_task_assignee_scope() RETURNS trigger AS $$
BEGIN
  IF NEW.removed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tasks t
    JOIN deliverables d ON d.id = t.deliverable_id AND d.organization_id = t.organization_id
    JOIN memberships m ON m.id = NEW.membership_id AND m.organization_id = t.organization_id AND m.status = 'ACTIVE'
    WHERE t.id = NEW.task_id AND t.organization_id = NEW.organization_id
      AND (d.project_id IN (SELECT p.id FROM projects p WHERE p.id = d.project_id AND p.owner_membership_id = NEW.membership_id)
        OR EXISTS (SELECT 1 FROM project_memberships pm WHERE pm.project_id = d.project_id AND pm.membership_id = NEW.membership_id AND pm.organization_id = t.organization_id AND pm.removed_at IS NULL))
  ) THEN RAISE EXCEPTION 'Task assignee must be an active member of the task project'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_assignee_scope
BEFORE INSERT OR UPDATE OF task_id, membership_id, removed_at, organization_id ON task_assignees
FOR EACH ROW EXECUTE FUNCTION enforce_task_assignee_scope();
