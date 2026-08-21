import { describe, expect, it } from "vitest";
import { createTextPdf } from "./simple-pdf";

describe("feedback PDF export", () => {
  it("creates a valid single-page PDF and escapes reviewer text", () => {
    const pdf = createTextPdf("Review (V2)", ["Client said: use \\ and (parentheses)"]);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Review \\(V2\\)");
    expect(text).toContain("startxref");
    expect(text.endsWith("%%EOF")).toBe(true);
  });
});
