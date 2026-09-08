"use client";
import { useActionState } from "react";
import { setManagerFinanceAccess } from "../app/(erp)/team/actions";
import { PreservingForm } from "./preserving-form";
export function ManagerFinanceAccess({ membershipId, granted }: { membershipId: string; granted: boolean }) {
  const [state, action, pending] = useActionState(setManagerFinanceAccess, {});
  return <PreservingForm action={action} className="mt-2"><input type="hidden" name="membershipId" value={membershipId}/><input type="hidden" name="grant" value={String(!granted)}/><button disabled={pending} className="min-h-11 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-violet-700">{pending ? "Saving…" : granted ? "Remove finance access" : "Grant finance access"}</button>{state.error && <p role="alert" className="mt-2 text-xs text-rose-700">{state.error}</p>}{state.success && <p role="status" className="mt-2 text-xs text-emerald-700">{state.success}</p>}</PreservingForm>;
}
