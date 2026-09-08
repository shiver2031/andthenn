"use server";
import { and, auditEvents, createDatabase, eq, memberships } from "@andthenn/db";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../../lib/actor-context";
import { demoModeEnabled } from "../../../lib/config";
import { isResourceId } from "../../../lib/resource-access";
export async function setManagerFinanceAccess(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const actor = await resolveActorContext();
  if (!actor || actor.role !== "FOUNDER" || demoModeEnabled()) return { error: "Founder permission required." };
  const memberId = String(form.get("membershipId") ?? ""), grant = form.get("grant") === "true";
  if (!isResourceId(memberId)) return { error: "Choose a Manager." };
  const { db } = createDatabase();
  try {
    await db.transaction(async (tx) => {
      const [founder] = await tx.select().from(memberships).where(and(eq(memberships.id, actor.membershipId), eq(memberships.organizationId, actor.organizationId))).limit(1).for("share");
      if (!founder || founder.role !== "FOUNDER" || founder.status !== "ACTIVE" || (founder.expiresAt && founder.expiresAt <= new Date()) || (founder.sessionRevokedAfter && (!actor.sessionIssuedAt || actor.sessionIssuedAt <= founder.sessionRevokedAfter))) throw new Error("Founder permission required.");
      const [member] = await tx.select().from(memberships).where(and(eq(memberships.id, memberId), eq(memberships.organizationId, actor.organizationId), eq(memberships.role, "MANAGER"), eq(memberships.status, "ACTIVE"))).limit(1).for("update");
      if (!member) throw new Error("Active Manager unavailable.");
      await tx.update(memberships).set({ financeAccess: grant, updatedAt: new Date() }).where(eq(memberships.id, member.id));
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: actor.displayName, source: "SERVER_ACTION", action: "member.finance_access_changed", objectType: "MEMBERSHIP", objectId: member.id, before: { financeAccess: member.financeAccess }, after: { financeAccess: grant }, correlationId: crypto.randomUUID() });
    });
    revalidatePath("/", "layout");
    return { success: grant ? "Finance access granted." : "Finance access removed." };
  } catch (error) { return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to update finance access." }; }
}
