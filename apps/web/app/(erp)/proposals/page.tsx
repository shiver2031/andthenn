import { Badge, Button } from "@andthenn/ui";
import { and, createDatabase, eq, intakeItems, proposals } from "@andthenn/db";
import { FileText, Plus } from "lucide-react";
import { PageHeading } from "../../../components/page-heading";
import { resolveActorContext } from "../../../lib/actor-context";
import { createProposalFromIntake } from "../intake/actions";

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ intake?: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return null; const params = await searchParams; const { db } = createDatabase();
  const [rows, intake] = await Promise.all([
    db.select().from(proposals).where(eq(proposals.organizationId, actor.organizationId)),
    params.intake ? db.select().from(intakeItems).where(and(eq(intakeItems.id, params.intake), eq(intakeItems.organizationId, actor.organizationId))).limit(1) : Promise.resolve([]),
  ]);
  const item = intake[0];
  return <><PageHeading eyebrow={`${rows.filter((row) => row.status === "PENDING").length} pending decisions`} title="Proposals" description="Working proposals retain their intake lineage and need a manager decision." />
    {item && item.claimedByMembershipId === actor.membershipId && <form action={createProposalFromIntake} className="surface mb-5 grid gap-3 rounded-2xl p-4 md:grid-cols-2"><input type="hidden" name="intakeItemId" value={item.id}/><input type="hidden" name="idempotencyKey" value={`proposal:${item.id}`}/><label className="text-xs font-bold text-zinc-600">Proposal title<input name="title" required maxLength={300} defaultValue={item.title ?? ""} className="mt-1 block h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm font-normal"/></label><label className="text-xs font-bold text-zinc-600">Budget (minor units)<input name="budgetMinor" type="number" min="0" step="1" className="mt-1 block h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm font-normal"/></label><label className="text-xs font-bold text-zinc-600 md:col-span-2">Brief<textarea name="brief" required defaultValue={item.confirmedSummary ?? ""} className="mt-1 block min-h-28 w-full rounded-xl border border-zinc-200 p-3 text-sm font-normal"/></label><Button type="submit" className="md:col-span-2"><Plus size={16}/> Create pending proposal</Button></form>}
    <div className="grid gap-4 lg:grid-cols-2">{rows.map((proposal) => <article key={proposal.id} className="surface rounded-2xl p-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><FileText size={18}/></span><Badge tone={proposal.status === "PENDING" ? "amber" : proposal.status === "APPROVED" ? "green" : "rose"}>{proposal.status}</Badge></div><h2 className="mt-5 text-lg font-bold">{proposal.title}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{proposal.brief}</p><p className="mt-5 text-xs font-semibold text-zinc-500">{proposal.budgetMinor === null ? "Budget to be confirmed" : `${proposal.currency} ${proposal.budgetMinor.toLocaleString()} minor units`}</p></article>)}</div>
    {!rows.length && <p className="py-10 text-center text-sm text-zinc-400">Claim an intake item to create the first proposal.</p>}
  </>;
}
