"use server";
import { and, auditEvents, brands, clients, contacts, createDatabase, eq, sql } from "@andthenn/db";
import { can } from "@andthenn/domain";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../lib/actor-context";
import { demoModeEnabled } from "../../lib/config";
import { isResourceId } from "../../lib/resource-access";
export async function saveRelationship(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const actor = await resolveActorContext();
  if (!actor || !can(actor, "clients:manage") || demoModeEnabled()) return { error: "Client management permission required." };
  const clientId = String(form.get("clientId") ?? ""), id = String(form.get("recordId") ?? ""), kind = String(form.get("kind") ?? ""), revision = String(form.get("revision") ?? ""), name = String(form.get("name") ?? "").trim(), detail = String(form.get("detail") ?? "").trim();
  if (!isResourceId(clientId) || (id && !isResourceId(id)) || !["client", "brand", "contact"].includes(kind) || !/^\d+$/.test(revision) || !name || name.length > (kind === "contact" ? 160 : 240) || detail.length > (kind === "contact" ? 160 : 10000)) return { error: "Enter a valid name and details." };
  const { db } = createDatabase();
  try {
    await db.transaction(async (tx) => {
      const [client] = await tx.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId))).limit(1).for("update");
      if (!client) throw new Error("Client unavailable.");
      const [changed] = await tx.update(clients).set({ updatedAt: new Date(), ...(kind === "client" ? { name, notes: detail || null } : {}) }).where(and(eq(clients.id, clientId), sql`${clients}.xmin::text = ${revision}`)).returning({ id: clients.id });
      if (!changed) throw new Error("The relationship changed. Reload before saving.");
      let recordId = clientId;
      let before: unknown = kind === "client" ? { name: client.name, notes: client.notes } : null;
      if (kind === "brand") {
        if (id) {
          const [brand] = await tx.select().from(brands).where(and(eq(brands.id, id), eq(brands.clientId, clientId), eq(brands.organizationId, actor.organizationId))).limit(1);
          if (!brand) throw new Error("Brand unavailable."); before = brand;
          await tx.update(brands).set({ name, notes: detail || null, updatedAt: new Date() }).where(eq(brands.id, id)); recordId = id;
        } else { const [created] = await tx.insert(brands).values({ organizationId: actor.organizationId, clientId, name, notes: detail || null }).returning({ id: brands.id }); recordId = created!.id; }
      }
      if (kind === "contact") {
        if (id) {
          const [contact] = await tx.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.clientId, clientId), eq(contacts.organizationId, actor.organizationId))).limit(1);
          if (!contact) throw new Error("Contact unavailable."); before = contact;
          await tx.update(contacts).set({ name, roleLabel: detail || null, updatedAt: new Date() }).where(eq(contacts.id, id)); recordId = id;
        } else { const [created] = await tx.insert(contacts).values({ organizationId: actor.organizationId, clientId, name, roleLabel: detail || null }).returning({ id: contacts.id }); recordId = created!.id; }
      }
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: actor.displayName, source: "SERVER_ACTION", action: "client.relationship_saved", objectType: kind.toUpperCase(), objectId: recordId, before, after: { clientId, name, detail }, correlationId: crypto.randomUUID() });
    });
    revalidatePath(`/clients/${clientId}`); revalidatePath("/clients"); return { success: "Relationship saved." };
  } catch (error) { return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to save. Check for a duplicate brand name, then reload and retry." }; }
}
