import { and, clients, createDatabase, eq, inArray, projects, sql, tasks } from "@andthenn/db";
import Link from "next/link";
import { PageHeading } from "../../../components/page-heading";
import { resolveActorContext } from "../../../lib/actor-context";

type Result = { id: string; title: string; kind: string; href: string; detail: string };
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return null;
  const { q: raw = "", page: rawPage = "1" } = await searchParams;
  const q = raw.trim().slice(0, 120), page = Math.max(1, Number(rawPage) || 1), limit = 25, offset = (page - 1) * limit;
  const { db } = createDatabase(); const needle = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const results: Result[] = [];
  if (q.length >= 2) {
    const taskWhere = actor.role === "MANAGER" ? and(eq(tasks.organizationId, actor.organizationId), sql`lower(${tasks.name}) like lower(${needle}) escape '\\'`) : and(eq(tasks.organizationId, actor.organizationId), inArray(tasks.id, [...actor.primaryTaskIds, ...actor.collaboratorTaskIds]), sql`lower(${tasks.name}) like lower(${needle}) escape '\\'`);
    const taskRows = await db.select({ id: tasks.id, title: tasks.name, state: tasks.stateKind }).from(tasks).where(taskWhere).limit(limit).offset(offset);
    results.push(...taskRows.map((row) => ({ id: row.id, title: row.title, kind: "Task", href: `/tasks/${row.id}`, detail: row.state })));
    if (actor.role === "MANAGER") {
      const [projectRows, clientRows] = await Promise.all([
        db.select({ id: projects.id, title: projects.name, status: projects.status }).from(projects).where(and(eq(projects.organizationId, actor.organizationId), sql`lower(${projects.name}) like lower(${needle}) escape '\\'`)).limit(limit),
        db.select({ id: clients.id, title: clients.name }).from(clients).where(and(eq(clients.organizationId, actor.organizationId), sql`lower(${clients.name}) like lower(${needle}) escape '\\'`)).limit(limit),
      ]);
      results.push(...projectRows.map((row) => ({ id: row.id, title: row.title, kind: "Project", href: `/projects/${row.id}`, detail: row.status })));
      results.push(...clientRows.map((row) => ({ id: row.id, title: row.title, kind: "Client", href: "/clients", detail: "Client record" })));
    }
  }
  return <><PageHeading title="Search" description="Results are scoped to your active membership and assignments." />
    <form className="surface flex h-14 max-w-3xl items-center gap-3 rounded-2xl px-4" action="/search"><input name="q" defaultValue={q} minLength={2} placeholder="Search tasks, projects, and clients…" className="flex-1 bg-transparent font-semibold outline-none" aria-label="Search query"/><button className="text-sm font-bold text-violet-600">Search</button></form>
    {q && q.length < 2 && <p className="mt-4 text-sm text-zinc-500">Enter at least two characters.</p>}<div className="mt-4 max-w-3xl space-y-2">{results.map((result) => <a key={`${result.kind}:${result.id}`} href={result.href} className="surface flex min-h-16 items-center gap-4 rounded-2xl p-4 hover:border-violet-300"><span className="grid size-10 place-items-center rounded-xl bg-zinc-950 text-xs font-bold text-white">{result.title[0]}</span><span className="flex-1"><span className="block text-sm font-bold">{result.title}</span><span className="text-xs text-zinc-400">{result.kind} · {result.detail}</span></span></a>)}{q.length >= 2 && !results.length && <p className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-500">No records you are permitted to see match this search.</p>}</div>
    {results.length >= limit && <Link className="mt-4 inline-block text-sm font-bold text-violet-600" href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next page →</Link>}</>;
}
