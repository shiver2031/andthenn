"use client";
import { PreservingForm } from "./preserving-form";
import { useActionState } from "react";
import { submitClientReview } from "../app/(erp)/client-review-actions";

export function ClientReviewForm({ shareId, version, decided = false }: { shareId: string; version: number; decided?: boolean }) {
  const [state, action, pending] = useActionState(submitClientReview, {});
  return <PreservingForm action={action} className="mt-4 space-y-3"><input type="hidden" name="shareId" value={shareId}/><input type="hidden" name="expectedVersion" value={version}/><label className="block text-sm font-semibold">Your decision<select name="decision" className="control mt-1"><option value="CHANGES">Request changes</option><option value="APPROVE">Approve this version</option></select></label><label className="block text-sm font-semibold">Feedback<textarea name="note" maxLength={5000} rows={3} className="control mt-1" placeholder="Describe changes, or add an optional approval note"/></label><button disabled={pending || decided} className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50">{pending ? "Sending…" : decided ? "Decision recorded" : "Send decision"}</button>{state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}</PreservingForm>;
}
