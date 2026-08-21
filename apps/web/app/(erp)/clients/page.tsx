import { Badge, Button } from "@andthenn/ui";
import { Building2, Plus } from "lucide-react";
import { clients, createDatabase, eq } from "@andthenn/db";
import { PageHeading } from "../../../components/page-heading";
import { archiveClient, createClient } from "../actions";
import { resolveActorContext } from "../../../lib/actor-context";

export default async function ClientsPage() {
  const actor = await resolveActorContext(); if (!actor) return null;
  const { db } = createDatabase();
  const rows = await db.select().from(clients).where(eq(clients.organizationId, actor.organizationId));
  const active = rows.filter((client) => client.lifecycle === "ACTIVE");
  return <>
    <PageHeading eyebrow={`${active.length} active clients`} title="Clients & brands" description="Organization-scoped client records with an immutable activity trail." />
    {actor.role === "MANAGER" && <form action={createClient} className="surface mb-5 grid gap-2 rounded-2xl p-4 md:grid-cols-[1fr_2fr_auto]">
      <label className="sr-only" htmlFor="client-name">Client name</label><input id="client-name" name="name" required maxLength={240} placeholder="Client name" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
      <input name="notes" maxLength={10000} placeholder="Notes (optional)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
      <Button type="submit"><Plus size={16} /> Add client</Button>
    </form>}
    <div className="surface overflow-hidden rounded-2xl"><div className="grid grid-cols-[1fr_110px_120px] border-b border-zinc-100 bg-zinc-50 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400"><span>Client</span><span>Status</span><span>Actions</span></div>
      {rows.map((client) => <div key={client.id} className="grid grid-cols-[1fr_110px_120px] items-center border-b border-zinc-100 px-5 py-4 text-xs"><span className="flex items-center gap-3 font-bold"><span className="grid size-9 place-items-center rounded-xl bg-zinc-950 text-white"><Building2 size={15}/></span>{client.name}</span><Badge tone={client.lifecycle === "ACTIVE" ? "green" : "neutral"}>{client.lifecycle}</Badge><span>{actor.role === "MANAGER" && client.lifecycle === "ACTIVE" && <form action={archiveClient}><input type="hidden" name="clientId" value={client.id}/><button className="text-xs font-semibold text-zinc-500 hover:text-red-600">Archive</button></form>}</span></div>)}
      {rows.length === 0 && <p className="p-8 text-center text-sm text-zinc-400">No clients yet. Add the first client to begin a project.</p>}
    </div>
  </>;
}
