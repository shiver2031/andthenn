"use client";

import { Button } from "@andthenn/ui";
import type { ProjectSetupDraft } from "@andthenn/contracts";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { finalizeProjectSetup, saveProjectSetup } from "../app/(erp)/intake/actions";

type Person = { id: string; name: string; role: string };
type Client = { id: string; name: string };

function localDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function isoFromLocal(value: string) { return new Date(value).toISOString(); }

function initialDraft(raw: unknown, ownerMembershipId: string): ProjectSetupDraft {
  const data = raw as Partial<ProjectSetupDraft>;
  const outputId = data.deliverables?.[0]?.id ?? crypto.randomUUID();
  const taskId = data.tasks?.[0]?.id ?? crypto.randomUUID();
  const deadline = data.deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  return {
    schemaVersion: 1,
    intakeItemId: data.intakeItemId ?? null,
    title: data.title || "New project",
    brief: data.brief || "",
    clientId: data.clientId || "",
    ownerMembershipId: data.ownerMembershipId || ownerMembershipId,
    deadline,
    budgetMinor: data.budgetMinor ?? null,
    currency: data.currency || "INR",
    notes: data.notes || "",
    deliverables: data.deliverables?.length ? data.deliverables : [{ id: outputId, name: "Project delivery", quantity: 1, format: "Digital", dueAt: deadline, notes: "" }],
    tasks: data.tasks?.length ? data.tasks : [{ id: taskId, deliverableId: outputId, name: "Initial production task", description: "", priority: "NORMAL", dueAt: deadline, estimatedMinutes: null, primaryOwnerId: data.ownerMembershipId || ownerMembershipId, collaboratorIds: [] }],
  };
}

export function ProjectSetupWizard({ proposalId, version, draftData, clients, members, closeHref }: { proposalId: string; version: number; draftData: unknown; clients: Client[]; members: Person[]; closeHref: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => initialDraft(draftData, members[0]?.id ?? ""));
  const [savedVersion, setSavedVersion] = useState(version);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const team = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) router.push(closeHref as never); };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [closeHref, pending, router]);

  function update<K extends keyof ProjectSetupDraft>(key: K, value: ProjectSetupDraft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function updateOutput(index: number, patch: Partial<ProjectSetupDraft["deliverables"][number]>) { setDraft((current) => ({ ...current, deliverables: current.deliverables.map((output, i) => i === index ? { ...output, ...patch } : output) })); }
  function updateTask(index: number, patch: Partial<ProjectSetupDraft["tasks"][number]>) { setDraft((current) => ({ ...current, tasks: current.tasks.map((task, i) => i === index ? { ...task, ...patch } : task) })); }
  function addOutput() {
    const id = crypto.randomUUID();
    setDraft((current) => ({ ...current, deliverables: [...current.deliverables, { id, name: "New output", quantity: 1, format: "Digital", dueAt: current.deadline, notes: "" }] }));
  }
  function addTask(deliverableId = draft.deliverables[0]?.id) {
    if (!deliverableId) return;
    setDraft((current) => ({ ...current, tasks: [...current.tasks, { id: crypto.randomUUID(), deliverableId, name: "New task", description: "", priority: "NORMAL", dueAt: current.deadline, estimatedMinutes: null, primaryOwnerId: current.ownerMembershipId, collaboratorIds: [] }] }));
  }
  function persist(nextStep?: number, final = false) {
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("proposalId", proposalId); form.set("expectedVersion", String(savedVersion)); form.set("draft", JSON.stringify(draft));
        if (final) {
          form.set("idempotencyKey", `setup:${proposalId}:${savedVersion}`);
          await finalizeProjectSetup(form);
        } else {
          const result = await saveProjectSetup(form);
          setSavedVersion(result.version);
          if (nextStep !== undefined) setStep(nextStep);
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this setup."); }
    });
  }
  const taskCount = draft.tasks.length;
  const uniqueTeam = [...new Set(draft.tasks.flatMap((task) => [task.primaryOwnerId, ...task.collaboratorIds]))].filter(Boolean);
  return <div role="dialog" aria-modal="true" aria-labelledby="project-setup-title" className="fixed inset-0 z-[80] flex items-end bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) router.push(closeHref as never); }}>
    <section className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[#fbfaf8] shadow-2xl sm:max-h-[90vh] sm:rounded-3xl">
      <header className="flex items-start gap-4 border-b border-zinc-200 bg-white px-5 py-4 sm:px-7"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-600">Project setup</p><h2 id="project-setup-title" className="display mt-1 text-xl font-bold">{draft.title || "New project"}</h2><p className="mt-1 text-xs text-zinc-500">This setup is your proposal. It becomes a live project only after confirmation.</p></div><button type="button" aria-label="Save and close project setup" disabled={pending} onClick={() => router.push(closeHref as never)} className="grid size-11 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><X size={18}/></button></header>
      <div className="border-b border-zinc-200 bg-white px-5 py-3 sm:px-7"><ol className="grid grid-cols-3 gap-2 text-[11px] font-bold"><li className={step >= 0 ? "text-violet-700" : "text-zinc-400"}>1. Project</li><li className={step >= 1 ? "text-violet-700" : "text-zinc-400"}>2. Work & team</li><li className={step >= 2 ? "text-violet-700" : "text-zinc-400"}>3. Confirm</li></ol></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        {step === 0 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Project name" className="sm:col-span-2"><input value={draft.title} onChange={(event) => update("title", event.target.value)} required className="control" /></Field><Field label="Client"><select value={draft.clientId} onChange={(event) => update("clientId", event.target.value)} className="control"><option value="">Choose a client…</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="Project owner"><select value={draft.ownerMembershipId} onChange={(event) => update("ownerMembershipId", event.target.value)} className="control">{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role.replaceAll("_", " ")}</option>)}</select></Field><Field label="Deadline"><input type="datetime-local" value={localDateTime(draft.deadline)} onChange={(event) => update("deadline", isoFromLocal(event.target.value))} className="control" /></Field><Field label="Budget (minor units)"><input type="number" min="0" value={draft.budgetMinor ?? ""} onChange={(event) => update("budgetMinor", event.target.value ? Number(event.target.value) : null)} placeholder="Optional" className="control" /></Field><Field label="Proposal brief" className="sm:col-span-2"><textarea value={draft.brief} onChange={(event) => update("brief", event.target.value)} rows={4} className="control resize-y" /></Field><Field label="Internal notes" className="sm:col-span-2"><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} rows={3} className="control resize-y" /></Field></div>}
        {step === 1 && <div className="space-y-6"><div><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Output groups</h3><p className="mt-1 text-xs text-zinc-500">Keep these light—tasks remain the day-to-day view.</p></div><Button type="button" size="sm" variant="secondary" onClick={addOutput}><Plus size={14}/> Add output</Button></div><div className="mt-3 space-y-3">{draft.deliverables.map((output, index) => <div key={output.id} className="grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 md:grid-cols-[1.4fr_.6fr_.8fr_.9fr_auto]"><input aria-label="Output name" value={output.name} onChange={(event) => updateOutput(index, { name: event.target.value })} className="control"/><input aria-label="Quantity" type="number" min="1" value={output.quantity} onChange={(event) => updateOutput(index, { quantity: Number(event.target.value) || 1 })} className="control"/><input aria-label="Format" value={output.format} onChange={(event) => updateOutput(index, { format: event.target.value })} className="control"/><input aria-label="Output due date" type="datetime-local" value={localDateTime(output.dueAt)} onChange={(event) => updateOutput(index, { dueAt: isoFromLocal(event.target.value) })} className="control"/><button type="button" aria-label={`Remove ${output.name}`} disabled={draft.deliverables.length === 1} onClick={() => setDraft((current) => ({ ...current, deliverables: current.deliverables.filter((_, i) => i !== index), tasks: current.tasks.filter((task) => task.deliverableId !== output.id) }))} className="grid min-h-11 place-items-center rounded-xl text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 size={16}/></button></div>)}</div></div><div><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Tasks and team</h3><p className="mt-1 text-xs text-zinc-500">Every task has one primary owner and optional collaborators.</p></div><Button type="button" size="sm" onClick={() => addTask()}><Plus size={14}/> Add task</Button></div><div className="mt-3 space-y-3">{draft.tasks.map((task, index) => <article key={task.id} className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><input aria-label="Task name" value={task.name} onChange={(event) => updateTask(index, { name: event.target.value })} className="control font-semibold"/><textarea aria-label="Task description" value={task.description} onChange={(event) => updateTask(index, { description: event.target.value })} placeholder="Task brief (optional)" rows={2} className="control mt-2 resize-y"/></div><button type="button" aria-label={`Remove ${task.name}`} disabled={draft.tasks.length === 1} onClick={() => setDraft((current) => ({ ...current, tasks: current.tasks.filter((_, i) => i !== index) }))} className="grid size-11 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 size={16}/></button></div><div className="mt-3 grid gap-2 md:grid-cols-4"><select aria-label="Output group" value={task.deliverableId} onChange={(event) => updateTask(index, { deliverableId: event.target.value })} className="control">{draft.deliverables.map((output) => <option key={output.id} value={output.id}>{output.name}</option>)}</select><select aria-label="Primary owner" value={task.primaryOwnerId} onChange={(event) => updateTask(index, { primaryOwnerId: event.target.value, collaboratorIds: task.collaboratorIds.filter((id) => id !== event.target.value) })} className="control">{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><select aria-label="Priority" value={task.priority} onChange={(event) => updateTask(index, { priority: event.target.value as ProjectSetupDraft["tasks"][number]["priority"] })} className="control"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select><input aria-label="Task due date" type="datetime-local" value={localDateTime(task.dueAt)} onChange={(event) => updateTask(index, { dueAt: isoFromLocal(event.target.value) })} className="control"/></div><div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr]"><input aria-label="Estimated minutes" type="number" min="1" value={task.estimatedMinutes ?? ""} onChange={(event) => updateTask(index, { estimatedMinutes: event.target.value ? Number(event.target.value) : null })} placeholder="Estimate (minutes)" className="control"/><div className="flex flex-wrap gap-2">{members.filter((member) => member.id !== task.primaryOwnerId).map((member) => { const selected = task.collaboratorIds.includes(member.id); return <button type="button" key={member.id} aria-pressed={selected} onClick={() => updateTask(index, { collaboratorIds: selected ? task.collaboratorIds.filter((id) => id !== member.id) : [...task.collaboratorIds, member.id] })} className={`min-h-10 rounded-xl border px-3 text-xs font-semibold ${selected ? "border-violet-400 bg-violet-50 text-violet-800" : "border-zinc-200 text-zinc-600 hover:border-violet-300"}`}>{member.name}</button>; })}</div></div></article>)}</div></div></div>}
        {step === 2 && <div className="space-y-4"><div className="rounded-2xl bg-violet-50 p-4"><p className="text-xs font-bold uppercase tracking-widest text-violet-700">Ready to create</p><h3 className="display mt-2 text-2xl font-bold">{draft.title}</h3><p className="mt-2 text-sm text-zinc-600">{draft.brief || "No proposal brief added."}</p></div><div className="grid gap-3 sm:grid-cols-3"><Summary label="Outputs" value={String(draft.deliverables.length)}/><Summary label="Tasks" value={String(taskCount)}/><Summary label="Assigned people" value={String(uniqueTeam.length)}/></div><div className="rounded-2xl border border-zinc-200 bg-white p-4"><h3 className="text-sm font-bold">Team review</h3><div className="mt-3 flex flex-wrap gap-2">{uniqueTeam.map((id) => <span key={id} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700">{team.get(id)?.name ?? "Assigned member"}</span>)}</div><p className="mt-4 text-xs leading-5 text-zinc-500">Confirmation creates all project records together and sends the primary owner of each task an assignment notification.</p></div></div>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </div>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-zinc-200 bg-white px-5 py-4 sm:px-7"><Button type="button" variant="ghost" disabled={pending || step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16}/> Back</Button><div className="flex gap-2">{step < 2 ? <Button type="button" disabled={pending} onClick={() => persist(step + 1)}>{pending ? "Saving…" : <>Save & continue <ChevronRight size={16}/></>}</Button> : <Button type="button" disabled={pending} onClick={() => persist(undefined, true)}>{pending ? "Creating…" : <><Check size={16}/> Confirm & create project</>}</Button>}</div></footer>
    </section>
  </div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`block text-xs font-bold text-zinc-600 ${className}`}><span>{label}</span><span className="mt-1.5 block">{children}</span></label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>; }
