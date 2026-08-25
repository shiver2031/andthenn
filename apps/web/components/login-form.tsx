"use client";

import { Button } from "@andthenn/ui";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

export function LoginForm({ prototype = false }: { prototype?: boolean }) {
  const [temporary, setTemporary] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function prototypeLogin(persona: "manager" | "employee" | "temporary" | "expired") {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/prototype/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona }) });
      const result = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok) setMessage(result.error ?? "Unable to start the prototype session."); else location.assign(result.redirectTo ?? "/home");
    } catch { setMessage("The local prototype session could not be started. Retry this action."); } finally { setBusy(false); }
  }

  async function googleLogin() {
    setBusy(true); setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=/home` } });
      if (error) setMessage(error.message);
    } catch { setMessage("Google sign-in is not configured."); } finally { setBusy(false); }
  }
  async function passwordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (error) setMessage("Sign-in failed. Check your invitation and credentials."); else location.assign("/home");
    } catch { setMessage("Temporary sign-in is not configured."); } finally { setBusy(false); }
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
    <p id="prototype-note" className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs leading-5 text-cyan-100">Prototype personas use an HttpOnly local session. External identity and provider connections are simulated.</p>
    {([[
      "manager", "Manager", "Full workflow, commercial and prototype tools",
    ], ["employee", "Employee", "Project and delivery workflow"], ["temporary", "Temporary collaborator", "Assigned work only"], ["expired", "Expired temporary", "Demonstrates the expiry boundary"]] as const).map(([persona, title, detail]) => (
      <form key={persona} action="/api/prototype/session" method="post"><button name="persona" value={persona} className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-3 text-left transition hover:border-violet-300/60 hover:bg-white/[.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-400/15 text-violet-200"><UserRound size={17}/></span><span><span className="block text-sm font-semibold text-white">{title}</span><span className="block text-xs text-zinc-400">{detail}</span></span></button></form>
    ))}
  </div>;
  if (temporary) return <form onSubmit={passwordLogin} className="mt-8 space-y-3">
    <label className="block text-xs text-zinc-400">Invitation email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400" /></label>
    <label className="block text-xs text-zinc-400">Password<input required type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400" /></label>
    <Button disabled={busy} size="lg" className="w-full" type="submit"><KeyRound size={16} /> Sign in</Button>
    <button type="button" disabled={busy} onClick={resetPassword} className="w-full text-xs text-cyan-300 hover:text-cyan-200">Reset password</button>
    <button type="button" onClick={() => setTemporary(false)} className="w-full text-xs text-zinc-500 hover:text-zinc-300">Use Google Workspace instead</button>
    {message && <p role="status" className="text-center text-xs text-zinc-400">{message}</p>}
  </form>;
  return <div className="mt-8">
    <Button disabled={busy} onClick={googleLogin} size="lg" className="w-full">Continue with Google Workspace <ArrowRight size={16}/></Button>
    <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-zinc-600"><span className="h-px flex-1 bg-white/10"/>or<span className="h-px flex-1 bg-white/10"/></div>
    <Button disabled={busy} onClick={() => setTemporary(true)} variant="dark" size="lg" className="w-full">Temporary collaborator sign in</Button>
    {message && <p role="status" className="mt-4 text-center text-xs text-zinc-400">{message}</p>}
  </div>;
}
