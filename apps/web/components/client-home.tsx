import Link from "next/link";
import { Badge } from "@andthenn/ui";
import { ArrowUpRight, FolderKanban, Sparkles } from "lucide-react";

export interface ClientHomeProject {
  id: string;
  name: string;
  status: string;
  deadline: Date;
}

export function ClientHome({ name, projects, reviews }: { name: string; projects: ClientHomeProject[]; reviews: { id: string; projectId: string; project: string; filename: string; version: number }[] }) {
  return <>
    <section data-walkthrough="home" className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-8 text-white sm:px-8">
      <div className="absolute -right-16 -top-20 size-64 rounded-full bg-violet-500/20 blur-3xl" />
      <p className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-300"><Sparkles size={14}/> Client workspace</p>
      <h1 className="display relative mt-3 text-3xl font-bold sm:text-4xl">Welcome back, {name.split(" ")[0]}</h1>
      <p className="relative mt-3 max-w-2xl text-sm leading-6 text-zinc-300">Track active projects and open shared files from one private, focused workspace.</p>
      <Link href="/files" className="relative mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-zinc-950">Open shared files <ArrowUpRight size={16}/></Link>
    </section>
    <section aria-label="Awaiting your review" className="surface mt-6 rounded-2xl p-5">
      <h2 className="display text-lg font-bold">Awaiting your review</h2>
      <p className="mt-1 text-sm text-zinc-500">{reviews.length ? "Open a shared version to approve it or send feedback to the team." : "You’re all caught up. New review requests will appear here."}</p>
      <div className="mt-3 divide-y divide-zinc-100">{reviews.map((review) => <Link key={review.id} href={`/projects/${review.projectId}#client-decisions`} className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block break-words">{review.filename} · v{review.version}</strong><span className="text-xs text-zinc-500">{review.project}</span></span><ArrowUpRight size={18} className="shrink-0 text-violet-600"/></Link>)}</div>
    </section>
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between"><h2 className="display text-lg font-bold">My projects</h2><span className="text-xs font-semibold text-zinc-400">{projects.length} active workspace{projects.length === 1 ? "" : "s"}</span></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="surface group rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100/50"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-600"><FolderKanban size={20}/></span><Badge tone={project.status === "COMPLETED" ? "green" : "violet"}>{project.status.replaceAll("_", " ")}</Badge></div><h3 className="mt-5 text-base font-bold">{project.name}</h3><p className="mt-2 text-xs font-semibold text-zinc-400">Due {project.deadline.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-violet-700">Open workspace <ArrowUpRight size={14}/></span></Link>)}</div>
      {!projects.length && <div className="surface rounded-2xl border-dashed p-10 text-center text-sm text-zinc-500">No project access is active. Ask your AndThenn contact if you expected to see one.</div>}
    </section>
  </>;
}
