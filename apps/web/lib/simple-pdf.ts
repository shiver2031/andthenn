function pdfText(value: string) { return value.replace(/[^\x20-\x7E]/g, "?").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"); }

/** Produces a deliberately small, dependency-free text PDF for audit exports. */
export function createTextPdf(title: string, lines: readonly string[]) {
  const pageLines = [title, "", ...lines].slice(0, 55);
  const stream = `BT /F1 11 Tf 44 790 Td 14 TL ${pageLines.map((line, index) => `${index ? "T* " : ""}(${pdfText(line).slice(0, 110)}) Tj`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n", offset = Buffer.byteLength(body); const offsets = [0];
  objects.forEach((object, index) => { offsets.push(offset); const encoded = `${index + 1} 0 obj\n${object}\nendobj\n`; body += encoded; offset += Buffer.byteLength(encoded); });
  const xref = offset; body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
