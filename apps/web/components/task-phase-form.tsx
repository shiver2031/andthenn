"use client";
import { PreservingForm } from "./preserving-form";
import { useActionState } from "react";
import { runTaskCommand } from "../app/(erp)/task-command";
export function TaskPhaseForm({ taskId, version, stageId, stages, leader }: { taskId: string; version: number; stageId: string | null; stages: { id: string; name: string }[]; leader: boolean }) {
  const [state, action, pending] = useActionState(runTaskCommand, {});
  return <PreservingForm action={action} className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="command" value="phase"/><input type="hidden" name="taskId" value={taskId}/><input type="hidden" name="expectedVersion" value={version}/><label className="text-sm font-semibold">Workflow phase<select name="targetStageId" defaultValue={stageId ?? ""} className="control mt-1">{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>{leader && <label className="text-sm font-semibold">Override reason<input name="reason" minLength={3} placeholder="Override reason (if needed)" className="control mt-1"/></label>}<button disabled={pending} className="min-h-11 rounded-xl bg-zinc-950 px-4 text-sm font-bold text-white">{pending ? "Moving…" : "Move task"}</button>{state.error && <p role="alert" className="w-full text-sm text-rose-700">{state.error}</p>}{state.success && <p role="status" className="w-full text-sm text-emerald-700">{state.success}</p>}</PreservingForm>;
}
