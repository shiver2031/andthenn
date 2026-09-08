import { can } from "@andthenn/domain";
import { resolveActorContext } from "../../../../lib/actor-context";
import { getFinanceSummary } from "../../../../lib/finance-summary";
const csv = (value: unknown) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
export async function GET() {
  const actor = await resolveActorContext();
  if (!actor || !can(actor, "finances:view")) return new Response("Not found", { status: 404 });
  const { rows } = await getFinanceSummary(actor);
  const data = ["project,currency,budget,latest_estimate,accepted_quote,invoice_status,invoice_total,paid_revenue,expenses,operational_gross_profit,estimated_margin", ...rows.map((row) => [row.name, row.currency, row.budget, row.quoted, row.acceptedQuote, row.invoiceStatus, row.invoiced, row.revenue, row.expense, row.grossProfit, row.estimatedMargin].map(csv).join(","))].join("\n");
  return new Response(data, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=finance-minor-units.csv", "cache-control": "no-store" } });
}
