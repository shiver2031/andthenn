import { sql, type Database } from "@andthenn/db";

/** Serialize task mutations with project closure before touching child state. */
export async function lockTaskProject(tx: Pick<Database, "execute">, taskId: string) {
  await tx.execute(sql`select p.id from projects p join deliverables d on d.project_id = p.id
    join tasks t on t.deliverable_id = d.id where t.id = ${taskId}::uuid for update of p`);
}
