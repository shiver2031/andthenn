import type { LucideIcon } from "lucide-react";
export function MetricCard({ label, value, detail, icon: Icon, accent = "violet" }: { label: string; value: string; detail: string; icon: LucideIcon; accent?: "violet" | "cyan" | "amber" | "green" }) {
  const colors = { violet: "bg-violet-50 text-violet-600", cyan: "bg-cyan-50 text-cyan-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" };
  return <article className="surface rounded-2xl p-5"><div className="flex items-start justify-between"><p className="text-xs font-semibold text-zinc-600">{label}</p><span className={`grid size-9 place-items-center rounded-xl ${colors[accent]}`}><Icon size={17} /></span></div><p className="display mt-5 text-3xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-zinc-600">{detail}</p></article>;
}
