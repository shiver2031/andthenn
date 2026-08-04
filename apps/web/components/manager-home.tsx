"use client";
import { Badge, Button } from "@andthenn/ui";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CheckCircle2, CircleAlert, Clock3, Inbox, Sparkles, TimerReset } from "lucide-react";
import Link from "next/link";
import { projects } from "../lib/demo-data";
import { MetricCard } from "./metric-card";

export function ManagerHome() {
  const reduced = useReducedMotion();
  return <>
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-violet-600">Tuesday · 04 August</p><h1 className="display text-3xl font-bold md:text-4xl">Good morning, Maya.</h1><p className="mt-2 text-sm text-zinc-500">Here’s what needs your attention across the studio.</p></div><Button asChild><Link href="/intake"><Inbox size={16} /> Open intake <span className="rounded-full bg-white/20 px-1.5 text-[10px]">4</span></Link></Button></div>
    <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active projects" value="12" detail="3 due this week" icon={Sparkles} />
      <MetricCard label="Needs attention" value="05" detail="2 deadline risks" icon={CircleAlert} accent="amber" />
      <MetricCard label="Awaiting approval" value="07" detail="3 ready to confirm" icon={CheckCircle2} accent="cyan" />
      <MetricCard label="Team utilisation" value="74%" detail="Arjun at 93%" icon={TimerReset} accent="green" />
    </section>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
      <section className="surface overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-zinc-100 p-5"><div><h2 className="display text-lg font-bold">Project pulse</h2><p className="mt-1 text-xs text-zinc-400">Live delivery health, by deadline</p></div><Link href="/projects" className="text-xs font-bold text-violet-600 hover:text-violet-800">View all</Link></div>
        <div className="divide-y divide-zinc-100">{projects.map((project, index) => <motion.div key={project.id} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }} className="grid gap-4 p-5 hover:bg-zinc-50/60 sm:grid-cols-[1fr_130px_100px] sm:items-center">
          <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-950 text-[10px] font-extrabold text-white">{project.client.split(" ").map((word) => word[0]).join("")}</span><div className="min-w-0"><Link href={`/projects/${project.id}`} className="block truncate text-sm font-bold hover:text-violet-600">{project.name}</Link><p className="mt-1 text-[11px] text-zinc-400">{project.code} · Owner {project.owner}</p></div></div>
          <div><div className="mb-1.5 flex justify-between text-[10px] font-bold text-zinc-400"><span>Progress</span><span>{project.progress}%</span></div><div className="h-1.5 rounded-full bg-zinc-100"><motion.div initial={{ width: 0 }} animate={{ width: `${project.progress}%` }} className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" /></div></div>
          <div className="flex items-center justify-between sm:block sm:text-right"><Badge tone={project.tone === "amber" ? "amber" : "green"}>{project.health}</Badge><p className="mt-1 text-[10px] text-zinc-400">Due {project.due}</p></div>
        </motion.div>)}</div>
      </section>
      <section className="overflow-hidden rounded-2xl bg-[#111320] text-white shadow-xl shadow-zinc-950/10"><div className="dot-grid border-b border-white/[.08] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Control room</p><h2 className="display mt-1 text-xl font-bold">Needs your call</h2></div><span className="grid size-9 place-items-center rounded-xl bg-white/10"><Clock3 size={17} /></span></div></div><div className="space-y-2 p-3">
        {[{title:"Confirm Hero Film approval",meta:"Aster House · V2",tone:"bg-emerald-400"},{title:"Resolve Juniper deadline risk",meta:"2 blocked dependencies",tone:"bg-amber-400"},{title:"Review Northstar proposal",meta:"₹8.4L estimated",tone:"bg-violet-400"}].map((item) => <button key={item.title} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/[.06]"><span className={`size-2 rounded-full ${item.tone}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block text-[11px] text-zinc-500">{item.meta}</span></span><ArrowUpRight size={15} className="text-zinc-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" /></button>)}
      </div></section>
    </div>
  </>;
}
