import { sql, createDatabase, eq, invoiceRecords, projectExpenses, projects, quotes, quoteVersions } from "@andthenn/db";
import { can } from "@andthenn/domain";
import type { ActorContext } from "./actor-context";
export async function getFinanceSummary(actor: ActorContext) {
  if (!can(actor, "finances:view")) throw new Error("Finance access required.");
  const { db } = createDatabase();
  const [projectRows, expenseRows, invoiceRows, quoteRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, status: projects.status, budget: projects.budgetMinor, currency: projects.currency }).from(projects).where(eq(projects.organizationId, actor.organizationId)),
    db.select({ id: projectExpenses.id, revision: sql<string>`project_expenses.xmin::text`, projectId: projectExpenses.projectId, amount: projectExpenses.amountMinor, currency: projectExpenses.currency, category: projectExpenses.category, incurredOn: projectExpenses.incurredOn, note: projectExpenses.note }).from(projectExpenses).where(eq(projectExpenses.organizationId, actor.organizationId)),
    db.select({ projectId: invoiceRecords.projectId, status: invoiceRecords.status, amount: invoiceRecords.amountMinor, currency: invoiceRecords.currency }).from(invoiceRecords).where(eq(invoiceRecords.organizationId, actor.organizationId)),
    db.select({ projectId: quotes.projectId, version: quoteVersions.versionNumber, total: quoteVersions.totalMinor, status: quoteVersions.status, currency: quotes.currency }).from(quoteVersions).innerJoin(quotes, eq(quotes.id, quoteVersions.quoteId)).where(eq(quoteVersions.organizationId, actor.organizationId)),
  ]);
  const rows = projectRows.flatMap((project) => {
    const currencies = [...new Set([project.currency, ...expenseRows.filter((item) => item.projectId === project.id).map((item) => item.currency), ...invoiceRows.filter((item) => item.projectId === project.id).map((item) => item.currency), ...quoteRows.filter((item) => item.projectId === project.id).map((item) => item.currency)])].sort();
    return currencies.map((currency) => {
      const expenses = expenseRows.filter((item) => item.projectId === project.id && item.currency === currency);
      const expense = expenses.reduce((sum, item) => sum + item.amount, 0);
      const invoice = invoiceRows.find((item) => item.projectId === project.id && item.currency === currency);
      const versions = quoteRows.filter((item) => item.projectId === project.id && item.currency === currency).sort((a,b) => b.version-a.version);
      const latestQuote = versions[0], acceptedQuote = versions.find((item) => item.status === "ACCEPTED");
      const invoiced = invoice?.amount ?? 0, revenue = invoice?.status === "PAID" ? invoiced : 0;
      const budget = currency === project.currency ? project.budget ?? 0 : 0;
      return { ...project, currency, budget, expenses, expense, invoiceStatus: invoice?.status ?? "NOT_RAISED", invoiced, revenue, quoted: latestQuote?.total ?? 0, acceptedQuote: acceptedQuote?.total ?? null, quoteStatus: latestQuote?.status ?? "NO_QUOTE", grossProfit: revenue-expense, estimatedMargin: (latestQuote?.total ?? budget)-expense };
    });
  });
  const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  const totals = currencies.map((currency) => { const group = rows.filter((row) => row.currency === currency); return { currency, budget: group.reduce((sum,row) => sum+row.budget,0), invoiced: group.reduce((sum,row) => sum+row.invoiced,0), revenue: group.reduce((sum,row) => sum+row.revenue,0), expense: group.reduce((sum,row) => sum+row.expense,0), partial: group.filter((row) => row.invoiceStatus === "PARTIALLY_PAID").reduce((sum,row) => sum+row.invoiced,0) }; });
  return { rows, totals, expenseRows, projectRows };
}
