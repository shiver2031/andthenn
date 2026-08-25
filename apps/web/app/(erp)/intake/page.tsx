import { Badge, Button } from "@andthenn/ui";
import { and, clients, createDatabase, eq, intakeItems, intakeSourceItems, memberships, profiles, projects, proposals } from "@andthenn/db";
import { FileText, Inbox, Mail, MessageCircle, PlayCircle, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeading } from "../../../components/page-heading";
import { ProjectSetupWizard } from "../../../components/project-setup-wizard";
import { resolveActorContext } from "../../../lib/actor-context";
import { OfflineIntakeCapture } from "../../../components/offline-intake-capture";
import { createManualIntake, startIntakeSetup } from "./actions";

const queueStatuses = new Set(["UNASSIGNED", "CLAIMED", "NEEDS_MANAGER_INPUT", "READY_FOR_DECISION"]);
const label = (channel: string) => channel === "WHATSAPP" ? "WhatsApp" : channel === "EMAIL" ? "Email" : channel === "PHONE" ? "Phone" : "Manual";
const statusTone = (status: string) => status === "CONVERTED" || status === "APPROVED" ? "green" as const : status === "SETUP_IN_PROGRESS" || status === "PENDING" ? "violet" as const : status === "REJECTED" || status === "IGNORED" ? "rose" as const : "amber" as const;

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ view?: string; item?: string; setup?: string }> }) {
  const actor = await resolveActorContext();
  if (!actor) return null;
  if (actor.role !== "MANAGER") redirect("/home");
  const params = await searchParams;
  if (params.setup && !params.view) redirect(`/intake?view=setups&setup=${params.setup}`);
  const view = params.view === "setups" || params.view === "history" ? params.view : "queue";
  const { db } = createDatabase();
  const [items, claimantRows, clientRows, memberRows, proposalRows, projectRows] = await Promise.all([
    db.select().from(intakeItems).where(eq(intakeItems.organizationId, actor.organizationId)).orderBy(intakeItems.createdAt),
    db.select({ id: memberships.id, name: profiles.displayName }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(eq(memberships.organizationId, actor.organizationId)),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.organizationId, actor.organizationId), eq(clients.lifecycle, "ACTIVE"))),
    db.select({ id: memberships.id, name: profiles.displayName, role: memberships.role }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))),
    db.select().from(proposals).where(eq(proposals.organizationId, actor.organizationId)).orderBy(proposals.updatedAt),
    db.select({ id: projects.id, proposalId: projects.proposalId, name: projects.name }).from(projects).where(eq(projects.organizationId, actor.organizationId)),
  ]);
  const queue = items.filter((item) => queueStatuses.has(item.status));
  const setups = proposalRows.filter((proposal) => proposal.status === "PENDING");
  const history = proposalRows.filter((proposal) => proposal.status !== "PENDING");
  const selected = queue.find((item) => item.id === params.item) ?? queue[0];
  const selectedSetup = setups.find((proposal) => proposal.id === params.setup);
  const claimantNames = new Map(claimantRows.map((claimant) => [claimant.id, claimant.name]));
  const projectByProposal = new Map(projectRows.filter((project) => project.proposalId).map((project) => [project.proposalId!, project]));
  const sources = view === "queue" && selected ? await db.select().from(intakeSourceItems).where(and(eq(intakeSourceItems.intakeItemId, selected.id), eq(intakeSourceItems.organizationId, actor.organizationId))).orderBy(intakeSourceItems.sequence) : [];
  const tab = (key: "queue" | "setups" | "history", title: string, count?: number) => <Link scroll={false} href={`/intake?view=${key}`} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold ${view === key ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>{title}{count !== undefined && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${view === key ? "bg-white/20" : "bg-zinc-100 text-zinc-500"}`}>{count}</span>}</Link>;
  return <>
    <PageHeading eyebrow={`${queue.length} decisions · ${setups.length} setups`} title="Intake" description="Review requests, finish saved setups, and keep project lineage in one place." />
    <nav aria-label="Intake views" className="surface mb-5 flex w-full gap-1 overflow-x-auto rounded-2xl p-2">{tab("queue", "Queue", queue.length)}{tab("setups", "Setups", setups.length)}{tab("history", "History")}</nav>
    {view === "queue" && <>
      <form action={createManualIntake} className="surface mb-5 grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_2fr_auto]">
        <label className="sr-only" htmlFor="intake-title">Request title</label><input id="intake-title" name="title" maxLength={300} placeholder="Request title" className="control" />
        <label className="sr-only" htmlFor="intake-summary">Request summary</label><input id="intake-summary" name="summary" required maxLength={10000} placeholder="Capture a call, voice-note summary, or forwarded request" className="control" />
        <input type="hidden" name="capturedAt" value={new Date().toISOString()} /><Button type="submit"><Plus size={16}/> Manual intake</Button>
      </form>
      <OfflineIntakeCapture />
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="surface overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><span className="text-xs font-bold">Manager queue</span><Badge tone="violet">Oldest first</Badge></div>
          <div className="divide-y divide-zinc-100">{queue.map((item) => <Link scroll={false} href={`/intake?view=queue&item=${item.id}`} key={item.id} className={`block p-4 transition hover:bg-zinc-50 ${selected?.id === item.id ? "bg-violet-50/60" : ""}`}><div className="flex items-center gap-2 text-xs text-zinc-500">{item.sourceChannel === "EMAIL" ? <Mail size={14}/> : item.sourceChannel === "WHATSAPP" ? <MessageCircle size={14}/> : <Inbox size={14}/>}<span>{label(item.sourceChannel)}</span><span className="ml-auto">{item.createdAt.toLocaleDateString()}</span></div><p className="mt-2 text-sm font-bold">{item.title ?? "Untitled request"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{item.confirmedSummary ?? "Source evidence awaiting review."}</p><div className="mt-3 flex items-center justify-between"><Badge tone={statusTone(item.status)}>{item.status.replaceAll("_", " ")}</Badge>{item.claimedByMembershipId && <span className="text-[11px] text-zinc-500">{claimantNames.get(item.claimedByMembershipId)}</span>}</div></Link>)}</div>
          {!queue.length && <p className="p-8 text-center text-sm text-zinc-400">No requests await a decision.</p>}
        </section>
        <section className="surface rounded-2xl p-5">{selected ? <><div className="flex flex-wrap items-start gap-3 border-b border-zinc-100 pb-4"><div className="mr-auto"><p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Evidence record</p><h2 className="mt-1 text-lg font-bold">{selected.title ?? "Untitled request"}</h2></div><form action={startIntakeSetup}><input type="hidden" name="intakeItemId" value={selected.id}/><Button type="submit"><PlayCircle size={16}/>Approve &amp; set up</Button></form></div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Original evidence</h3>{sources.map((source) => <article key={source.id} className="mt-3 rounded-xl bg-zinc-50 p-4"><p className="text-xs font-semibold text-zinc-500">{source.sender ?? "Unknown sender"} · {source.capturedAt.toLocaleString()}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{source.rawText ?? "Structured provider attachment; original evidence retained."}</p></article>)}</div><div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-4"><h3 className="text-sm font-bold">One setup, one handoff</h3><p className="mt-2 text-sm leading-6 text-zinc-600">Approval opens a saved project setup. Define outputs, tasks, and assigned people before one final confirmation creates the project.</p></div></div>
        </> : <p className="py-12 text-center text-sm text-zinc-400">Select or capture a request to begin.</p>}</section>
      </div>
    </>}
    {view === "setups" && <section className="grid gap-4 lg:grid-cols-2">{setups.map((proposal) => <article key={proposal.id} className={`surface rounded-2xl p-5 ${selectedSetup?.id === proposal.id ? "ring-2 ring-violet-400" : ""}`}><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><FileText size={18}/></span><Badge tone="violet">Saved setup</Badge></div><h2 className="mt-5 text-lg font-bold">{proposal.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">{proposal.brief || "No project brief yet."}</p><p className="mt-4 text-xs font-semibold text-zinc-500">{proposal.intakeItemId ? "Linked to intake" : "Manager-created project"} · Updated {proposal.updatedAt.toLocaleDateString()}</p><Link scroll={false} href={`/intake?view=setups&setup=${proposal.id}`} className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-violet-600 px-3 text-sm font-bold text-white hover:bg-violet-700">Resume setup</Link></article>)}{!setups.length && <p className="surface rounded-2xl p-8 text-center text-sm text-zinc-500">No saved setups. Approve an intake item or create a new project to start one.</p>}</section>}
    {view === "history" && <section className="grid gap-4 lg:grid-cols-2">{history.map((proposal) => { const project = projectByProposal.get(proposal.id); return <article key={proposal.id} className="surface rounded-2xl p-5"><div className="flex items-center justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><FileText size={18}/></span><Badge tone={statusTone(proposal.status)}>{proposal.status}</Badge></div><h2 className="mt-5 text-lg font-bold">{proposal.title}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{proposal.brief || "No project brief recorded."}</p>{proposal.decisionReason && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{proposal.decisionReason}</p>}{project ? <Link href={`/projects?project=${project.id}`} className="mt-5 inline-flex text-sm font-bold text-violet-700 hover:text-violet-900">Open project: {project.name}</Link> : <p className="mt-5 text-xs font-semibold text-zinc-500">Decision recorded {proposal.decidedAt?.toLocaleDateString() ?? ""}</p>}</article>; })}{!history.length && <p className="surface rounded-2xl p-8 text-center text-sm text-zinc-500">Completed and rejected setups will appear here.</p>}</section>}
    {selectedSetup && <ProjectSetupWizard proposalId={selectedSetup.id} version={selectedSetup.version} draftData={selectedSetup.draftData} clients={clientRows} members={memberRows} closeHref="/intake?view=setups"/>}
  </>;
}
