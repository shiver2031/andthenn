"use client";

import { Button } from "@andthenn/ui";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

export function LoginForm({ prototype = false, review = false }: { prototype?: boolean; review?: boolean }) {
  const router = useRouter();
  const [temporary, setTemporary] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function personaLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const persona = submitter?.value;
    if (!persona) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/prototype/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona }),
      });
      if (!response.ok) throw new Error("Unable to open the demo workspace. Please try again.");
      router.replace("/home?walkthrough=start");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open the demo workspace.");
      setBusy(false);
    }
  }

  async function googleLogin() {
    setBusy(true); setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=/home?walkthrough=start` } });
      if (error) setMessage(error.message);
    } catch { setMessage("Google sign-in is not configured."); } finally { setBusy(false); }
  }
  async function passwordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (error) { setMessage("Sign-in failed. Check your invitation and credentials."); setBusy(false); }
      else router.replace("/home?walkthrough=start");
    } catch { setMessage("Temporary sign-in is not configured."); setBusy(false); }
  }
  async function resetPassword() {
    if (!email) { setMessage("Enter your invitation email first."); return; }
    setBusy(true); setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
      setMessage(error ? "Unable to send reset email." : "If this invited account exists, a reset email has been sent.");
    } catch { setMessage("Temporary sign-in is not configured."); } finally { setBusy(false); }
  }
  if (prototype) return <div className="mt-8 space-y-3" aria-describedby="prototype-note">
    <p id="prototype-note" className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-900">{review ? "Explore with a demo persona. External connections are simulated." : "Explore with a local persona. External connections are simulated."}</p>
    {([[
      "founder", "Founder", "Company view, approvals and Accounts",
    ], ["manager", "Manager", "Today's work, clients and team"], ["designer", "Designer", "Assigned work and review"], ["temporary", "Temporary Designer", "Assigned work only"], ["clientAster", "Client · Riya at Aster", "Aster projects and approved files only"], ["clientJuniper", "Client · Dev at Juniper", "Juniper projects and approved files only"], ["expired", "Expired temporary", "Demonstrates the expiry boundary"]] as const).map(([persona, title, detail]) => (
      <form key={persona} action="/api/prototype/session" method="post" onSubmit={personaLogin}><button disabled={busy} name="persona" value={persona} className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><UserRound aria-hidden="true" size={17}/></span><span><span className="block text-sm font-semibold text-zinc-900">{busy ? "Opening workspace…" : title}</span><span className="block text-xs text-zinc-600">{detail}</span></span></button></form>
    ))}
    {message && <p role="status" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{message}</p>}
  </div>;
  if (temporary) return <form onSubmit={passwordLogin} className="mt-8 space-y-3">
    <label className="block text-xs text-zinc-600">Invitation email<input required autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="control mt-1.5" /></label>
    <label className="block text-xs text-zinc-600">Password<input required autoComplete="current-password" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="control mt-1.5" /></label>
    <Button disabled={busy} size="lg" className="w-full" type="submit"><KeyRound aria-hidden="true" size={16} /> {busy ? "Signing in…" : "Sign in"}</Button>
    <button type="button" disabled={busy} onClick={resetPassword} className="min-h-11 w-full rounded-lg text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50">Reset password</button>
    <button type="button" disabled={busy} onClick={() => { setTemporary(false); setMessage(null); }} className="min-h-11 w-full rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50">Use Google Workspace instead</button>
    {message && <p role="status" className="rounded-xl bg-violet-50 p-3 text-sm leading-5 text-violet-900">{message}</p>}
  </form>;
  return <div className="mt-8">
    <Button disabled={busy} onClick={googleLogin} size="lg" className="w-full">{busy ? "Connecting…" : "Continue with Google Workspace"} <ArrowRight aria-hidden="true" size={16}/></Button>
    <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-zinc-600"><span className="h-px flex-1 bg-zinc-200"/>or<span className="h-px flex-1 bg-zinc-200"/></div>
    <Button disabled={busy} onClick={() => { setTemporary(true); setMessage(null); }} variant="secondary" size="lg" className="w-full">Temporary collaborator sign in</Button>
    {message && <p role="status" className="mt-4 rounded-xl bg-violet-50 p-3 text-sm leading-5 text-violet-900">{message}</p>}
  </div>;
}
