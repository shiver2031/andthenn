import { sql } from "@andthenn/db";
import { isOperationalLeader } from "@andthenn/domain";
import type { ActorContext } from "./actor-context";
const ids = (values: Iterable<string>) => { const rows = [...values]; return rows.length ? sql.join(rows.map((value) => sql`${value}::uuid`), sql`,`) : sql`null::uuid`; };
/** Authorization precedes matching, pagination and notification preview rendering. */
export function resourceCatalog(actor: ActorContext) {
  const leader = isOperationalLeader(actor.role), internal = actor.role !== "CLIENT";
  const assigned = ids([...actor.primaryTaskIds, ...actor.collaboratorTaskIds, ...actor.assignedByMeTaskIds]);
  const direct = ids(actor.visibleProjectIds);
  return sql`with visible_projects as (
    select p.* from projects p where p.organization_id=${actor.organizationId}::uuid and (
      ${leader} or (${!internal} and p.id in (${direct}) and p.client_id in (${ids(actor.linkedClientIds)}))
      or (${internal} and (p.id in (${direct}) or exists (select 1 from tasks t join deliverables d on d.id=t.deliverable_id where d.project_id=p.id and t.id in (${assigned}))))
    )), visible_tasks as (
      select t.*, d.project_id from tasks t join deliverables d on d.id=t.deliverable_id join visible_projects p on p.id=d.project_id
      where ${internal} and t.organization_id=${actor.organizationId}::uuid and (${leader} or p.id in (${direct}) or t.id in (${assigned}))
    ), catalog as (
      select p.id, 'PROJECT'::text kind, p.name title, '/projects/'||p.id href, p.status::text detail from visible_projects p
      union all select t.id, 'TASK', t.name, '/tasks/'||t.id, t.execution_status::text from visible_tasks t
      union all select c.id, 'CLIENT', c.name, '/clients/'||c.id, 'Client workspace' from clients c where ${leader} and c.organization_id=${actor.organizationId}::uuid
      union all select i.id, 'INTAKE_ITEM', coalesce(i.title,'Untitled brief'), '/intake?view=queue&item='||i.id, i.status::text from intake_items i where ${leader} and i.organization_id=${actor.organizationId}::uuid
      union all select p.id, 'PROPOSAL', p.title, '/intake?view=setups&setup='||p.id, p.status::text from proposals p where ${leader} and p.organization_id=${actor.organizationId}::uuid
      union all select d.id, 'DELIVERABLE', d.name, '/projects/'||d.project_id||'#outputs', d.status::text from deliverables d join visible_projects p on p.id=d.project_id
      union all select v.id, 'FILE_VERSION', v.filename, case when ${internal} then '/tasks/'||a.task_id else '/api/files/'||v.id end, 'Version '||v.version_number from file_versions v join file_assets a on a.id=v.file_asset_id join tasks t on t.id=a.task_id join deliverables d on d.id=t.deliverable_id join visible_projects p on p.id=d.project_id where (${internal} and t.id in (select id from visible_tasks)) or (${!internal} and exists (select 1 from current_final_files f where f.file_version_id=v.id))
      union all select c.id, 'INTERNAL_COMMENT', left(c.body,120), case when c.task_id is not null then '/tasks/'||c.task_id else '/projects/'||c.project_id end||'#comment-'||c.id, c.body from internal_comments c where ${internal} and c.organization_id=${actor.organizationId}::uuid and (c.task_id in (select id from visible_tasks) or c.project_id in (select id from visible_projects))
      union all select c.id, 'REVIEW_COMMENT', left(c.body,120), '/tasks/'||h.task_id||'#review', c.body from review_comments c join review_shares s on s.id=c.review_share_id join review_hubs h on h.id=s.review_hub_id where h.task_id in (select id from visible_tasks)
      union all select s.id, 'REVIEW_SHARE', v.filename, case when ${internal} then '/tasks/'||h.task_id else '/projects/'||d.project_id||'#client-decisions' end, 'Review version' from review_shares s join review_hubs h on h.id=s.review_hub_id join tasks t on t.id=h.task_id join deliverables d on d.id=t.deliverable_id join visible_projects p on p.id=d.project_id join file_versions v on v.id=s.file_version_id where s.status='ACTIVE' and (s.expires_at is null or s.expires_at>now()) and (${!internal} or t.id in (select id from visible_tasks))
      union all select m.id, 'PERSON', p.display_name, case when ${leader} then '/team#member-'||m.id else '/work?member='||m.id end, 'Shared work' from memberships m join profiles p on p.id=m.profile_id where ${internal} and m.organization_id=${actor.organizationId}::uuid and m.role<>'CLIENT' and m.status='ACTIVE' and (m.starts_at is null or m.starts_at<=now()) and (m.expires_at is null or m.expires_at>now()) and (${leader} or exists (select 1 from task_assignees a where (a.membership_id=m.id or a.assigned_by_membership_id=m.id) and a.removed_at is null and a.task_id in (select id from visible_tasks)))
    )`;
}
export type CatalogRow = { id: string; kind: string; title: string; href: string; detail: string };
