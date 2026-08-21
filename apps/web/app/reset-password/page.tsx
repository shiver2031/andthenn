import { LockKeyhole } from "lucide-react";
import { ResetPasswordForm } from "../../components/reset-password-form";

export default function ResetPasswordPage() {
  return <main className="dot-grid grid min-h-screen place-items-center bg-[#0d0f19] p-5 text-white"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[.055] p-7 shadow-2xl backdrop-blur-xl"><span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-lg font-black">A</span><h1 className="display mt-7 text-3xl font-bold">Set a new password.</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Choose a new password for your temporary collaborator account.</p><ResetPasswordForm /><p className="mt-6 flex items-center justify-center gap-2 text-[10px] text-zinc-600"><LockKeyhole size={12} /> Recovery links are single-use and expire automatically</p></section></main>;
}
