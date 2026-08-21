import { Badge, Button } from "@andthenn/ui";
import { and, createDatabase, eq, intakeItems, intakeSourceItems, memberships, profiles } from "@andthenn/db";
import { Inbox, LockKeyhole, Mail, MessageCircle, Plus, UserRoundCheck } from "lucide-react";
import { PageHeading } from "../../../components/page-heading";
import { resolveActorContext } from "../../../lib/actor-context";
import { OfflineIntakeCapture } from "../../../components/offline-intake-capture";
import { claimIntake, createManualIntake, releaseIntake } from "./actions";

const label = (channel: string) => channel === "WHATSAPP" ? "WhatsApp" : channel === "EMAIL" ? "Email" : "Manual";

export default async function IntakePage() {
  const actor = await resolveActorContext(); if (!actor) return null;
  const { db } = createDatabase();
  const [items, claimants] = await Promise.all([
    db.select().from(intakeItems).where(eq(intakeItems.organizationId, actor.organizationId)).orderBy(intakeItems.createdAt),
    db.select({ id: memberships.id, name: profiles.displayName }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(eq(memberships.organizationId, actor.organizationId)),
  ]);
  const claimantNames = new Map(claimants.map((claimant) => [claimant.id, claimant.name]));
  const selected = items.find((item) => item.status !== "CONVERTED") ?? items[0];
  const sources = selected ? await db.select().from(intakeSourceItems).where(and(eq(intakeSourceItems.intakeItemId, selected.id), eq(intakeSourceItems.organizationId, actor.organizationId))).orderBy(intakeSourceItems.sequence) : [];
  const canWork = actor.role === "MANAGER" || actor.role === "EMPLOYEE";
  return <>
    <PageHeading eyebrow={`${items.filter((item) => item.status === "UNASSIGNED").length} unassigned`} title="Intake control" description="Preserve source evidence, claim work transactionally, then activate it once." />
    {canWork && <form action={createManualIntake} className="surface mb-5 grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_2fr_auto]">
      <label className="sr-only" htmlFor="intake-title">Request title</label><input id="intake-title" name="title" maxLength={300} placeholder="Request title" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
      <label className="sr-only" htmlFor="intake-summary">Request summary</label><input id="intake-summary" name="summary" required maxLength={10000} placeholder="Capture a call, voice-note summary, or forwarded request" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
      <input type="hidden" name="capturedAt" value={new Date().toISOString()} /><Button type="submit"><Plus size={16}/> Manual intake</Button>
    </form>}
    {canWork && <OfflineIntakeCapture />}
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <section className="surface overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><span className="text-xs font-bold">Shared manager queue</span><Badge tone="violet">Oldest first</Badge></div>
        <div className="divide-y divide-zinc-100">{items.map((item) => <div key={item.id} className={`p-4 ${selected?.id === item.id ? "bg-violet-50/60" : ""}`}><div className="flex items-center gap-2 text-xs text-zinc-500">{item.sourceChannel === "EMAIL" ? <Mail size={14}/> : item.sourceChannel === "WHATSAPP" ? <MessageCircle size={14}/> : <Inbox size={14}/>}<span>{label(item.sourceChannel)}</span><span className="ml-auto">{item.createdAt.toLocaleDateString()}</span></div><p className="mt-2 text-sm font-bold">{item.title ?? "Untitled request"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{item.confirmedSummary ?? "Source evidence awaiting review."}</p><div className="mt-3 flex items-center justify-between"><Badge tone={item.status === "UNASSIGNED" ? "amber" : item.status === "CONVERTED" ? "green" : "violet"}>{item.status.replaceAll("_", " ")}</Badge>{item.claimedByMembershipId && <span className="text-[11px] text-zinc-500">{claimantNames.get(item.claimedByMembershipId)}</span>}</div></div>)}</div>
        {!items.length && <p className="p-8 text-center text-sm text-zinc-400">No requests in the queue. Capture the first request above.</p>}
      </section>
      <section className="surface rounded-2xl p-5">{selected ? <><div className="flex flex-wrap items-start gap-3 border-b border-zinc-100 pb-4"><div className="mr-auto"><p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Evidence record</p><h2 className="mt-1 text-lg font-bold">{selected.title ?? "Untitled request"}</h2></div>{canWork && selected.status === "UNASSIGNED" && <form action={claimIntake}><input type="hidden" name="intakeItemId" value={selected.id}/><input type="hidden" name="lockVersion" value={selected.lockVersion}/><Button type="submit"><LockKeyhole size={15}/> Claim item</Button></form>}{canWork && selected.claimedByMembershipId === actor.membershipId && <form action={releaseIntake}><input type="hidden" name="intakeItemId" value={selected.id}/><input type="hidden" name="lockVersion" value={selected.lockVersion}/><Button variant="secondary" type="submit"><UserRoundCheck size={15}/> Release claim</Button></form>}</div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Original evidence</h3>{sources.map((source) => <article key={source.id} className="mt-3 rounded-xl bg-zinc-50 p-4"><p className="text-xs font-semibold text-zinc-500">{source.sender ?? "Unknown sender"} · {source.capturedAt.toLocaleString()}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{source.rawText ?? "Structured provider attachment; original evidence retained."}</p></article>)}</div><div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-4"><h3 className="text-sm font-bold">Activation next</h3><p className="mt-2 text-sm leading-6 text-zinc-600">Claim this request, then create a proposal or launch the validated activation wizard. AI suggestions stay off until explicitly enabled by an administrator.</p>{selected.claimedByMembershipId === actor.membershipId && <div className="mt-4 flex gap-2"><a href={`/proposals?intake=${selected.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white">Create proposal</a><a href={`/projects?intake=${selected.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold">Activate project</a></div>}</div></div>
      </> : <p className="py-12 text-center text-sm text-zinc-400">Select or capture a request to begin.</p>}</section>
    </div>
  </>;
}
