import { can } from "@andthenn/domain";
import type { ActorContext } from "../lib/actor-context";
import { getFinanceSummary } from "../lib/finance-summary";
export async function ProjectFinance({ actor, projectId }: { actor: ActorContext; projectId: string }) {
  if (!can(actor, "finances:view")) return null;
  const { rows } = await getFinanceSummary(actor);
  return <section className="surface mb-4 rounded-2xl p-5"><h2 className="text-lg font-bold">Operational finance</h2><p className="mt-1 text-sm text-zinc-600">Paid invoice totals are operational revenue. Partial invoice totals do not imply received amounts. Figures include the recorded invoice tax interpretation; finance-owner certification is required.</p>{rows.filter((row) => row.id === projectId).map((row) => <dl key={row.currency} className="mt-4 grid gap-3 sm:grid-cols-3">{[["Latest estimate", row.quoted], ["Accepted quote", row.acceptedQuote], ["Paid revenue", row.revenue], ["Recorded expenses", row.expense], ["Operational gross profit", row.grossProfit], ["Estimated margin", row.estimatedMargin]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-zinc-600">{label}</dt><dd className="font-bold">{value === null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency }).format(Number(value)/100)}</dd></div>)}</dl>)}</section>;
}
