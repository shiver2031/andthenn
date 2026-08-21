import { Badge, Button } from "@andthenn/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { and, clients, createDatabase, eq, inArray, intakeItems, memberships, profiles, projects } from "@andthenn/db";
import { PageHeading } from "../../../components/page-heading";
import { createProject } from "../actions";
import { activateIntakeProject } from "../intake/actions";
import { resolveActorContext } from "../../../lib/actor-context";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ intake?: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return null; const params = await searchParams; const { db } = createDatabase();
  const isManager = actor.role === "MANAGER";
  const visibleProjectIds = [...actor.visibleProjectIds];
  const [projectRows, clientRows, members, intake] = await Promise.all([
    isManager
      ? db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline, client: clients.name }).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).where(eq(projects.organizationId, actor.organizationId))
      : visibleProjectIds.length
        ? db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline, client: clients.name }).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).where(and(eq(projects.organizationId, actor.organizationId), inArray(projects.id, visibleProjectIds)))
        : Promise.resolve([]),
    isManager ? db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.organizationId, actor.organizationId), eq(clients.lifecycle, "ACTIVE"))) : Promise.resolve([]),
    isManager ? db.select({ id: memberships.id, name: profiles.displayName }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))) : Promise.resolve([]),
    isManager && params.intake ? db.select().from(intakeItems).where(and(eq(intakeItems.id, params.intake), eq(intakeItems.organizationId, actor.organizationId))).limit(1) : Promise.resolve([]),
  ]);
  const intakeItem = intake[0];
  return <><PageHeading eyebrow={`${projectRows.length} projects`} title="Projects" description="Live projects and deadlines, scoped to your organization." />
    {actor.role === "MANAGER" && intakeItem?.claimedByMembershipId === actor.membershipId && <form action={activateIntakeProject} className="surface mb-5 grid gap-2 rounded-2xl p-4 md:grid-cols-2"><input type="hidden" name="intakeItemId" value={intakeItem.id}/><input type="hidden" name="idempotencyKey" value={`project:${intakeItem.id}`}/><input name="name" required maxLength={300} defaultValue={intakeItem.title ?? ""} placeholder="Project name" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"/><select name="clientId" required className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"><option value="">Client…</option>{clientRows.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><select name="ownerMembershipId" required className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"><option value="">Project owner…</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><input name="deadline" required type="datetime-local" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"/><input name="budgetMinor" type="number" min="0" step="1" placeholder="Budget (minor units)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"/><Button type="submit"><Plus size={16}/> Confirm activation</Button><p className="text-xs leading-5 text-zinc-500 md:col-span-2">Final confirmation creates the project, workflow and source lineage together. Add deliverables and tasks next.</p></form>}
    {actor.role === "MANAGER" && <form action={createProject} className="surface mb-5 grid gap-2 rounded-2xl p-4 md:grid-cols-4"><input name="name" required maxLength={300} placeholder="Project name" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"/><select name="clientId" required className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"><option value="">Client…</option>{clientRows.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><input name="deadline" required type="datetime-local" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"/><Button type="submit"><Plus size={16}/> New project</Button></form>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projectRows.map((project) => <Link href={`/projects/${project.id}`} key={project.id} className="surface rounded-2xl p-5 hover:border-violet-300"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl bg-zinc-950 text-xs font-black text-white">{project.client.slice(0, 2).toUpperCase()}</span><Badge tone={project.status === "ACTIVE" ? "green" : "violet"}>{project.status.replaceAll("_", " ")}</Badge></div><p className="mt-5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{project.client}</p><h2 className="mt-1 text-base font-bold">{project.name}</h2><p className="mt-4 text-xs text-zinc-500">Due {project.deadline.toLocaleDateString()}</p></Link>)}</div>
    {!projectRows.length && <p className="py-10 text-center text-sm text-zinc-400">Create a project after adding an active client.</p>}</>;
}
