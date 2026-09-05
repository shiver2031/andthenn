"use server";
import { and, auditEvents, createDatabase, eq, projectExpenses, sql } from "@andthenn/db";
import { can } from "@andthenn/domain";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../lib/actor-context";
import { demoModeEnabled } from "../../lib/config";
import { isResourceId } from "../../lib/resource-access";

export async function correctExpense(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const actor = await resolveActorContext();
  if (!actor || !can(actor, "accounts:manage") || demoModeEnabled()) return { error: "Expense management permission required." };
  const id = String(form.get("id") ?? ""), token = String(form.get("revision") ?? ""), amount = String(form.get("amount") ?? ""), category = String(form.get("category") ?? "").trim(), reason = String(form.get("reason") ?? "").trim(), incurredOn = String(form.get("incurredOn") ?? "");
  const parsedDate = new Date(incurredOn), amountMinor = Math.round(Number(amount) * 100);
  if (!isResourceId(id) || !/^\d+$/.test(token) || !/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !category || category.length > 120 || reason.length < 3 || reason.length > 1000 || !/^\d{4}-\d{2}-\d{2}$/.test(incurredOn) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== incurredOn) return { error: "Enter a positive amount, valid date/category, and a correction reason (3–1000 characters)." };
  const { db } = createDatabase();
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(projectExpenses).where(and(eq(projectExpenses.id, id), eq(projectExpenses.organizationId, actor.organizationId))).limit(1).for("update");
      if (!before) throw new Error("Expense unavailable.");
      const [changed] = await tx.update(projectExpenses).set({ amountMinor, category, incurredOn, updatedAt: new Date() }).where(and(eq(projectExpenses.id, id), sql`${projectExpenses}.xmin::text = ${token}`)).returning({ id: projectExpenses.id });
      if (!changed) throw new Error("Expense changed elsewhere. Reload before correcting it.");
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: actor.displayName, source: "SERVER_ACTION", action: "project.expense_corrected", objectType: "PROJECT_EXPENSE", objectId: id, before: { amountMinor: before.amountMinor, category: before.category, incurredOn: before.incurredOn }, after: { amountMinor, category, incurredOn }, reason, correlationId: crypto.randomUUID() });
    });
    revalidatePath("/accounts"); return { success: "Expense corrected. The original values remain in audit history." };
  } catch (error) { return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to correct this expense. Reload and retry." }; }
}
