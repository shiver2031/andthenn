import { LockKeyhole } from "lucide-react";
import { LoginForm } from "../../components/login-form";
import { prototypeRuntimeEnabled, reviewRuntimeEnabled } from "../../lib/config";

export default function LoginPage() {
  const prototype = prototypeRuntimeEnabled();
  const review = reviewRuntimeEnabled();
  return <main className="login-canvas grid min-h-dvh place-items-center px-4 py-8 text-[var(--ink)] sm:py-12">
    <section aria-labelledby="login-title" className="login-card w-full max-w-md rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-violet-700 text-lg font-black text-white shadow-sm">A</span>
        <span className="display text-lg font-bold">AndThenn<span className="text-violet-700">.</span></span>
      </div>
      <h1 id="login-title" className="display mt-7 text-3xl font-bold leading-tight">Welcome to AndThenn.</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{prototype
        ? "Choose a local persona. No external account or connection is required."
        : review ? "Choose a review persona. This shared environment contains demonstration data only."
        : "A quieter place to run the busy parts of creative work."}</p>
      <LoginForm prototype={prototype || review} review={review}/>
      <p className="mt-6 flex items-start justify-center gap-2 text-center text-xs leading-5 text-zinc-600">
        <LockKeyhole aria-hidden="true" className="mt-1 shrink-0" size={13}/>
        {prototype ? "Local prototype · simulated services" : review ? "Demo workspace · simulated services" : "Invite-only workspace · protected activity history"}
      </p>
    </section>
  </main>;
}
