import { sql } from "@andthenn/db";
/** Same membership scope powers recipient choices and validation at write time. */
export function discussionMemberScope(organizationId: string, projectId: string | ReturnType<typeof sql>, taskId?: string) {
  return sql`memberships.organization_id = ${organizationId}::uuid and memberships.status = 'ACTIVE' and memberships.role <> 'CLIENT'
    and (memberships.starts_at is null or memberships.starts_at <= now()) and (memberships.expires_at is null or memberships.expires_at > now())
    and (memberships.role in ('FOUNDER','MANAGER') or exists (select 1 from project_memberships pm where pm.project_id = ${projectId}::uuid and pm.membership_id = memberships.id and pm.removed_at is null)
      or exists (select 1 from task_assignees a join tasks t on t.id=a.task_id join deliverables d on d.id=t.deliverable_id where d.project_id=${projectId}::uuid and a.removed_at is null and (a.membership_id=memberships.id or a.assigned_by_membership_id=memberships.id) ${taskId ? sql`and t.id = ${taskId}::uuid` : sql``}))`;
}
