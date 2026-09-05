"use client";
import { PreservingForm } from "./preserving-form";
import { useActionState } from "react";
import { runTaskCommand } from "../app/(erp)/task-command";

export function TaskExecutionControls({ taskId, version, status, pendingRequest, isPrimary, isLeader, isReviewer, reviewers = [] }: { taskId: string; version: number; status: string; pendingRequest: boolean; isPrimary: boolean; isLeader: boolean; isReviewer: boolean; reviewers?: { id: string; name: string }[] }) {
  const common = { taskId, version };
  return <div className="mt-4 space-y-3">
    {status !== "COMPLETED" && (isPrimary || isLeader) && <CommandForm {...common} command="status" label={pendingRequest ? "Update and withdraw request" : "Update status"}>
      <label className="block text-xs font-semibold">Execution status<select key={status} name="status" defaultValue={status} className="control mt-1"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="WAITING">Waiting</option><option value="BLOCKED">Blocked</option></select></label>
      {!isPrimary && <Reason required/>}
    </CommandForm>}
    {status !== "COMPLETED" && (pendingRequest ? !isPrimary && (isReviewer || isLeader) && <CommandForm {...common} command="confirm" label="Confirm completion"><Reason required={!isReviewer}/><p className="text-xs text-zinc-500">A reason is required if you are taking over from the original assigner.</p></CommandForm> : isPrimary && <CommandForm {...common} command="request" label="Request completion"/>)}
    {status === "COMPLETED" && isLeader && <CommandForm {...common} command="reopen" label="Reopen task"><Reason required/><p className="text-xs text-zinc-500">Reopens project and output rollups while preserving approved-file history.</p></CommandForm>}
    {isLeader && status !== "COMPLETED" && <details><summary className="min-h-11 cursor-pointer text-sm font-bold">Designate independent reviewer</summary><CommandForm {...common} command="designate" label="Designate reviewer"><label className="block text-xs font-semibold">Reviewer<select name="reviewerMembershipId" required className="control mt-1"><option value="">Choose a teammate</option>{reviewers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><Reason required/></CommandForm></details>}
  </div>;
}

function Reason({ required = false }: { required?: boolean }) { return <label className="block text-xs font-semibold">Reason{required ? " (required)" : " (if taking over)"}<input name="reason" required={required} minLength={3} className="control mt-1" placeholder="Explain the decision"/></label>; }
function CommandForm({ taskId, version, command, label, children }: { taskId: string; version: number; command: string; label: string; children?: React.ReactNode }) {
  const [state, action, pending] = useActionState(runTaskCommand, {});
  return <PreservingForm action={action} className="space-y-2"><input type="hidden" name="taskId" value={taskId}/><input type="hidden" name="expectedVersion" value={version}/><input type="hidden" name="command" value={command}/>{children}<button disabled={pending} className="min-h-11 w-full rounded-xl bg-zinc-950 px-3 text-sm font-bold text-white disabled:opacity-50">{pending ? "Saving…" : label}</button>{state.error && <p role="alert" className="text-xs text-rose-700">{state.error}</p>}{state.success && <p role="status" className="text-xs text-emerald-700">{state.success}</p>}</PreservingForm>;
}
