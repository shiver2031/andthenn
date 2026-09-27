"use client";

import { LocalDateTimeInput } from "./local-date-time-input";
import { browserFormData } from "../lib/browser-form-data";

import { Button } from "@andthenn/ui";
import { CalendarClock, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createTask } from "../app/(erp)/actions";

type Member = { id: string; name: string; role: string };
type ProjectOption = { id: string; name: string; client: string; deliverables: Array<{ id: string; name: string; dueAt: string }> };

export function TaskCreateDialog({ projects, members, initialProjectId, initialDeliverableId }: { projects: ProjectOption[]; members: Member[]; initialProjectId?: string | undefined; initialDeliverableId?: string | undefined }) {
  const router = useRouter();
  const initialProject = projects.find((project) => project.id === initialProjectId) ?? projects[0];
  const [projectId, setProjectId] = useState(initialProject?.id ?? "");
  const project = projects.find((candidate) => candidate.id === projectId);
  const [deliverableId, setDeliverableId] = useState(() => project?.deliverables.some((item) => item.id === initialDeliverableId) ? initialDeliverableId! : project?.deliverables[0]?.id ?? "");
  const deliverable = project?.deliverables.find((item) => item.id === deliverableId) ?? project?.deliverables[0];
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const collaborators = useMemo(() => members.filter((member) => member.id !== ownerId), [members, ownerId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) router.push("/work"); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [pending, router]);

  const close = () => router.push("/work");

  function changeProject(nextId: string) {
    setProjectId(nextId);
    setDeliverableId(projects.find((candidate) => candidate.id === nextId)?.deliverables[0]?.id ?? "");
  }

  function submit(form: HTMLFormElement) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createTask(browserFormData(form));
        router.push(`/tasks/${result.taskId}`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to create the task. Check the fields and retry.");
      }
    });
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="new-task-title" className="fixed inset-0 z-[80] flex items-end bg-zinc-950/50 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) close(); }}>
    <section className="max-h-[100dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#fbfaf8] shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
      <header className="flex items-start gap-4 border-b border-zinc-200 bg-white px-5 py-4 sm:px-7"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><Plus size={20}/></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-600">Universal task</p><h2 id="new-task-title" className="display mt-1 text-2xl font-bold">Create and assign work</h2><p className="mt-1 text-sm text-zinc-500">Any active internal teammate can own work in a project you can access.</p></div><button type="button" aria-label="Close task creation" disabled={pending} onClick={close} className="grid size-11 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><X size={18}/></button></header>
      {!projects.length ? <div className="p-8 text-center"><p className="text-sm font-bold">No project workspace is available</p><p className="mt-2 text-sm text-zinc-500">You need an active project grant or assigned project work before creating a task.</p></div> : <form className="space-y-5 p-5 sm:p-7" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-zinc-600">Project<select name="projectId" value={projectId} onChange={(event) => changeProject(event.target.value)} className="control mt-1.5">{projects.map((item) => <option key={item.id} value={item.id}>{item.client} · {item.name}</option>)}</select></label><label className="text-xs font-bold text-zinc-600">Output<select name="deliverableId" value={deliverable?.id ?? ""} onChange={(event) => setDeliverableId(event.target.value)} required className="control mt-1.5">{project?.deliverables.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <label className="block text-xs font-bold text-zinc-600">Task name<input name="name" required maxLength={300} autoFocus className="control mt-1.5" placeholder="What is the next concrete action?"/></label>
        <label className="block text-xs font-bold text-zinc-600">Brief<textarea name="description" maxLength={10000} rows={3} className="control mt-1.5 resize-y" placeholder="Outcome, context, and acceptance notes"/></label>
        <div className="grid gap-4 sm:grid-cols-3"><label className="text-xs font-bold text-zinc-600">Primary owner<select name="ownerMembershipId" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required className="control mt-1.5">{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role.toLowerCase()}</option>)}</select></label><label className="text-xs font-bold text-zinc-600">Priority<select name="priority" defaultValue="NORMAL" className="control mt-1.5"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label className="text-xs font-bold text-zinc-600">Due date<LocalDateTimeInput key={deliverable?.id} name="dueAt" required max={deliverable?.dueAt} defaultValue={deliverable?.dueAt} className="control mt-1.5"/></label></div>
        <label className="block max-w-48 text-xs font-bold text-zinc-600"><span className="flex items-center gap-1"><CalendarClock size={14}/> Estimate in minutes</span><input name="estimatedMinutes" type="number" min="1" max="1000000" className="control mt-1.5" placeholder="Optional"/></label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="requiresClientDelivery"/>Requires Client approval and final file delivery</label>
        <fieldset><legend className="text-xs font-bold text-zinc-600">Collaborators <span className="font-normal text-zinc-400">optional</span></legend><div className="mt-2 flex flex-wrap gap-2">{collaborators.map((member) => <label key={member.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:border-violet-300"><input name="collaboratorMembershipId" type="checkbox" value={member.id}/>{member.name}</label>)}</div></fieldset>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error} Your entries are still here.</p>}
        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-5"><Button type="button" variant="ghost" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending || !deliverable || !ownerId}><Plus size={16}/>{pending ? "Creating…" : "Create task"}</Button></div>
      </form>}
    </section>
  </div>;
}
