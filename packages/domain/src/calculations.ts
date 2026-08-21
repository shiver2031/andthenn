import { invariant } from "./errors";
import type { QuoteLineInput, WorkloadInput } from "./model";

export interface QuoteLineTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function calculateQuoteLine(line: QuoteLineInput): QuoteLineTotals {
  invariant(
    Number.isInteger(line.quantity) && line.quantity > 0,
    "QUOTE_QUANTITY_INVALID",
    "Quantity must be a positive integer",
  );
  invariant(
    Number.isInteger(line.unitRateMinor) && line.unitRateMinor >= 0,
    "QUOTE_RATE_INVALID",
    "Unit rate must use non-negative minor units",
  );
  invariant(
    line.discountBasisPoints >= 0 && line.discountBasisPoints <= 10_000,
    "QUOTE_DISCOUNT_INVALID",
    "Discount is out of range",
  );
  invariant(
    line.taxBasisPoints >= 0 && line.taxBasisPoints <= 10_000,
    "QUOTE_TAX_INVALID",
    "Tax is out of range",
  );

  const roundBasisPoints = (amount: bigint, basisPoints: number) =>
    (amount * BigInt(basisPoints) + 5_000n) / 10_000n;
  const subtotal = BigInt(line.quantity) * BigInt(line.unitRateMinor);
  const discount = roundBasisPoints(subtotal, line.discountBasisPoints);
  const taxable = subtotal - discount;
  const tax = roundBasisPoints(taxable, line.taxBasisPoints);
  const values = [subtotal, discount, taxable, tax, taxable + tax];
  invariant(
    values.every((value) => value <= BigInt(Number.MAX_SAFE_INTEGER)),
    "QUOTE_TOTAL_TOO_LARGE",
    "Quotation total exceeds safe minor-unit precision",
  );
  const [subtotalMinor, discountMinor, taxableMinor, taxMinor, totalMinor] =
    values.map(Number);
  return {
    subtotalMinor: subtotalMinor!,
    discountMinor: discountMinor!,
    taxableMinor: taxableMinor!,
    taxMinor: taxMinor!,
    totalMinor: totalMinor!,
  };
}

export function calculateQuote(
  lines: readonly QuoteLineInput[],
): QuoteLineTotals {
  invariant(
    lines.length > 0,
    "QUOTE_LINES_REQUIRED",
    "A quotation needs at least one line",
  );
  return lines.map(calculateQuoteLine).reduce(
    (total, line) => {
      const next = {
        subtotalMinor: total.subtotalMinor + line.subtotalMinor,
        discountMinor: total.discountMinor + line.discountMinor,
        taxableMinor: total.taxableMinor + line.taxableMinor,
        taxMinor: total.taxMinor + line.taxMinor,
        totalMinor: total.totalMinor + line.totalMinor,
      };
      invariant(
        Object.values(next).every(Number.isSafeInteger),
        "QUOTE_TOTAL_TOO_LARGE",
        "Quotation total exceeds safe minor-unit precision",
      );
      return next;
    },
    {
      subtotalMinor: 0,
      discountMinor: 0,
      taxableMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
    },
  );
}

export function splitGst(
  taxMinor: number,
  interstate: boolean,
): { cgstMinor: number; sgstMinor: number; igstMinor: number } {
  if (interstate) return { cgstMinor: 0, sgstMinor: 0, igstMinor: taxMinor };
  const cgstMinor = Math.floor(taxMinor / 2);
  return { cgstMinor, sgstMinor: taxMinor - cgstMinor, igstMinor: 0 };
}

export function workloadSummary(
  input: WorkloadInput,
): WorkloadInput & {
  utilization: number | null;
  risk: "UNKNOWN" | "HEALTHY" | "WATCH" | "OVERLOADED";
} {
  const planned =
    input.primaryEstimatedMinutes + input.collaboratorEstimatedMinutes;
  if (input.capacityMinutes <= 0 || input.missingEstimateCount > 0) {
    return {
      ...input,
      utilization:
        input.capacityMinutes > 0 ? planned / input.capacityMinutes : null,
      risk: "UNKNOWN",
    };
  }
  const utilization = planned / input.capacityMinutes;
  const risk =
    utilization > 1 ? "OVERLOADED" : utilization >= 0.85 ? "WATCH" : "HEALTHY";
  return { ...input, utilization, risk };
}

export function deadlineAdherence(
  dueAt: Date,
  completedAt: Date | null,
  now = new Date(),
): "ON_TIME" | "LATE" | "OPEN" | "OVERDUE" {
  if (completedAt)
    return completedAt.getTime() <= dueAt.getTime() ? "ON_TIME" : "LATE";
  return now.getTime() > dueAt.getTime() ? "OVERDUE" : "OPEN";
}
