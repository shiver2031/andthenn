import { sql } from "drizzle-orm";
import type { Database } from "./client";

export const requiredCrmMigration = 1788562800000;

export async function crmSchemaReady(db: Pick<Database, "execute">, requireJournal = true): Promise<boolean> {
  const [shape] = await db.execute<{ ready: boolean; journal: string | null }>(sql`
    select to_regclass('public.current_final_files') is not null
      and to_regclass('public.final_deliveries') is not null
      and to_regtype('public.task_execution_status') is not null
      and to_regclass('public.client_memberships') is not null
      and to_regclass('public.internal_comment_mentions') is not null
      and to_regclass('public.task_review_selections') is not null
      and to_regclass('public.project_expenses') is not null
      and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tasks'
        and column_name in ('execution_status', 'completion_requested_at', 'completion_requested_by_membership_id', 'completion_reviewer_membership_id', 'completion_confirmed_at', 'completion_confirmed_by_membership_id', 'requires_client_delivery', 'completion_delegate_membership_id')) = 8
      and exists (select 1 from pg_constraint where conrelid = to_regclass('public.tasks') and conname = 'task_completion_confirmation_shape') as ready,
      to_regclass('drizzle.__drizzle_migrations')::text as journal
  `);
  if (!shape?.ready) return false;
  if (!requireJournal) return true; // local SQL-bootstrap prototype only
  if (!shape.journal) return false;
  const [version] = await db.execute<{ ready: boolean }>(sql`select exists (select 1 from drizzle.__drizzle_migrations where created_at >= ${requiredCrmMigration}) as ready`);
  return version?.ready === true;
}
