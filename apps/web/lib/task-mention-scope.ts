import { and, eq, memberships, sql } from "@andthenn/db";

/** Mention notifications contain task text, so recipients must already have read access. */
export function taskMentionScope(organizationId: string, taskId: string) {
  return and(
    eq(memberships.organizationId, organizationId),
    eq(memberships.status, "ACTIVE"),
    sql`(${memberships.startsAt} is null or ${memberships.startsAt} <= now())`,
    sql`(${memberships.expiresAt} is null or ${memberships.expiresAt} > now())`,
    sql`${memberships.role} <> 'CLIENT'`,
    sql`(${memberships.role} in ('FOUNDER', 'MANAGER') or exists (
      select 1 from task_assignees a where a.task_id = ${taskId}::uuid
      and a.organization_id = ${organizationId}::uuid and a.removed_at is null
      and (a.membership_id = ${memberships.id} or a.assigned_by_membership_id = ${memberships.id})
    ) or exists (
      select 1 from project_memberships pm join deliverables d on d.project_id = pm.project_id
      join tasks t on t.deliverable_id = d.id where t.id = ${taskId}::uuid
      and pm.organization_id = ${organizationId}::uuid and pm.membership_id = ${memberships.id}
      and pm.removed_at is null
    ))`,
  );
}
