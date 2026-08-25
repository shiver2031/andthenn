import { Badge } from "@andthenn/ui";
import { CalendarClock, FolderKanban } from "lucide-react";
import Link from "next/link";

export type AssignedWork = { id: string; name: string; dueAt: Date; projectId: string; project: string; client: string; output: string; stage: string; priority: string };

function bucket(tasks: AssignedWork[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inWeek = new Date(today); inWeek.setDate(today.getDate() + 7);
  return { overdue: tasks.filter((task) => task.dueAt < today), current: tasks.filter((task) => task.dueAt >= today && task.dueAt <= inWeek), upcoming: tasks.filter((task) => task.dueAt > inWeek) };
}

export function AssignedWorkHome({ name, temporary, expiresAt, tasks }: { name: string; temporary: boolean; expiresAt: Date | null; tasks: AssignedWork[] }) {
  const groups = bucket(tasks);
  return <><div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-violet-600">{temporary ? "Assigned collaborator work" : "My delivery work"}</p><h1 className="display text-3xl font-bold md:text-4xl">{temporary ? `Welcome, ${name.split(" ")[0]}.` : `Your work, ${name.split(" ")[0]}.`}</h1><p className="mt-2 text-sm text-zinc-600">{temporary ? "Only tasks assigned to you are visible here." : "Your assigned tasks and the project context needed to deliver them."}</p></div>
    {temporary && expiresAt && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><CalendarClock size={17}/><span>Access expires {expiresAt.toLocaleDateString()}.</span></div>}
    <div className="grid gap-4 xl:grid-cols-3"><WorkGroup title="Needs attention" tasks={groups.overdue} tone="rose"/><WorkGroup title="This week" tasks={groups.current} tone="violet"/><WorkGroup title="Upcoming" tasks={groups.upcoming} tone="cyan"/></div>
    {!tasks.length && <div className="surface mt-4 rounded-2xl p-10 text-center text-sm text-zinc-500">No tasks are currently assigned to you.</div>}
  </>;
}

function WorkGroup({ title, tasks, tone }: { title: string; tasks: AssignedWork[]; tone: "rose" | "violet" | "cyan" }) { return <section className="surface overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-zinc-100 p-4"><h2 className="display text-base font-bold">{title}</h2><Badge tone={tone}>{tasks.length}</Badge></div><div className="divide-y divide-zinc-100">{tasks.map((task) => <Link key={task.id} href={`/tasks/${task.id}`} className="block p-4 hover:bg-violet-50/40"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><FolderKanban size={16}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{task.name}</span><span className="mt-1 block truncate text-xs text-zinc-500">{task.project} · {task.output}</span><span className="mt-2 flex items-center justify-between gap-2"><Badge tone="violet">{task.stage}</Badge><span className="text-[11px] font-semibold text-zinc-500">Due {task.dueAt.toLocaleDateString()}</span></span></span></div></Link>)}</div>{!tasks.length && <p className="p-5 text-sm text-zinc-400">Nothing here.</p>}</section>; }
