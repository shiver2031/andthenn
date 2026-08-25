"use client";

import { Badge, Button } from "@andthenn/ui";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CircleAlert, Clock3, Inbox, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ManagerHomeData } from "../lib/manager-overview";
import { MetricCard } from "./metric-card";

export function ManagerHome({ name, data }: { name: string; data: ManagerHomeData }) {
  const reduced = useReducedMotion();
  return <>
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-violet-600">Studio overview</p><h1 className="display text-3xl font-bold md:text-4xl">Welcome back, {name.split(" ")[0]}.</h1><p className="mt-2 text-sm text-zinc-600">Here’s what needs your attention across the studio.</p></div><Button asChild><Link href="/intake?view=queue"><Inbox size={16} /> Open intake <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{data.counts.actionable}</span></Link></Button></div>
    <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active projects" value={String(data.activeProjects)} detail="Open project workspace" icon={Sparkles} />
      <MetricCard label="Intake decisions" value={String(data.counts.queue)} detail="Awaiting manager review" icon={Inbox} accent="amber" />
      <MetricCard label="Setups to finish" value={String(data.counts.setups)} detail="Saved project setups" icon={Clock3} accent="cyan" />
      <MetricCard label="Overdue tasks" value={String(data.overdueTasks)} detail={`${data.clientReviewTasks} in client review`} icon={CircleAlert} accent="green" />
    </section>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
      <section className="surface overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-zinc-100 p-5"><div><h2 className="display text-lg font-bold">Project pulse</h2><p className="mt-1 text-xs text-zinc-600">Live delivery health, by deadline</p></div><Link href="/projects" className="text-xs font-bold text-violet-700 hover:text-violet-900">View all</Link></div>
        <div className="divide-y divide-zinc-100">{data.projects.map((project, index) => <motion.div key={project.id} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }} className="grid gap-4 p-5 hover:bg-zinc-50/60 sm:grid-cols-[1fr_130px_100px] sm:items-center">
          <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-950 text-[10px] font-extrabold text-white">{project.client.split(" ").map((word) => word[0]).join("")}</span><div className="min-w-0"><Link href={`/projects?project=${project.id}`} className="block truncate text-sm font-bold hover:text-violet-700">{project.name}</Link><p className="mt-1 text-[11px] text-zinc-600">{project.client} · Owner {project.owner}</p></div></div>
          <div><div className="mb-1.5 flex justify-between text-[10px] font-bold text-zinc-600"><span>Progress</span><span>{project.progress}%</span></div><div className="h-1.5 rounded-full bg-zinc-100"><motion.div initial={{ width: 0 }} animate={{ width: `${project.progress}%` }} className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" /></div></div>
          <div className="flex items-center justify-between sm:block sm:text-right"><Badge tone={project.health === "At risk" ? "amber" : "green"}>{project.health}</Badge><p className="mt-1 text-[10px] text-zinc-600">Due {project.deadlineLabel}</p></div>
        </motion.div>)}{!data.projects.length && <p className="p-8 text-center text-sm text-zinc-500">No active projects yet. Finish a setup to create the first one.</p>}</div>
      </section>
      <section className="overflow-hidden rounded-2xl bg-[#111320] text-white shadow-xl shadow-zinc-950/10"><div className="dot-grid border-b border-white/[.08] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Control room</p><h2 className="display mt-1 text-xl font-bold">Needs your call</h2></div><span className="grid size-9 place-items-center rounded-xl bg-white/10"><Clock3 size={17} /></span></div></div><div className="space-y-2 p-3">
        {data.attention.map((item) => <Link href={item.href as Route} key={item.id} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/[.06]"><span className={`size-2 rounded-full ${item.tone === "rose" ? "bg-rose-400" : item.tone === "emerald" ? "bg-emerald-400" : item.tone === "amber" ? "bg-amber-400" : "bg-violet-400"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block text-[11px] text-zinc-300">{item.meta}</span></span><ArrowUpRight size={15} className="text-zinc-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" /></Link>)}
        {!data.attention.length && <p className="p-3 text-sm leading-6 text-zinc-300">Nothing needs your call right now.</p>}
      </div></section>
    </div>
  </>;
}
