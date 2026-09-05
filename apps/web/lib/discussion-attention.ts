import { createDatabase, sql } from "@andthenn/db";
import type { ActorContext } from "./actor-context";
import { resourceCatalog, type CatalogRow } from "./resource-catalog";
export async function getDiscussionAttention(actor: ActorContext) {
  const { db } = createDatabase();
  const rows = await db.execute<CatalogRow>(sql`${resourceCatalog(actor)} select distinct c.* from catalog c join notifications n on n.object_id=c.id and n.object_type=c.kind where n.organization_id=${actor.organizationId}::uuid and n.recipient_membership_id=${actor.membershipId}::uuid and n.read_at is null and c.kind in ('INTERNAL_COMMENT','REVIEW_COMMENT') order by c.id`);
  return rows.map((row) => ({ id: `mention:${row.id}`, title: "You were mentioned", meta: row.title, href: row.href, tone: "violet" as const }));
}
