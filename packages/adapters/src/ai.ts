import { GoogleAuth } from "google-auth-library";
import type { AiAssistProvider, AiSuggestion } from "@andthenn/domain";

interface GoogleAiConfig {
  projectId: string;
  location: string;
  documentProcessorId?: string;
  geminiModel?: string;
  geminiEnabled: boolean;
  credentials?: Record<string, unknown>;
}

export class GoogleAiAssistAdapter implements AiAssistProvider {
  private readonly auth: GoogleAuth;
  constructor(private readonly config: GoogleAiConfig) {
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  }

  private async bearer() {
    const headers = await (await this.auth.getClient()).getRequestHeaders();
    return headers.get("authorization") ?? "";
  }

  async transcribe(input: { bytes: Uint8Array; contentType: string; languageHint?: string }): Promise<AiSuggestion<string>> {
    const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize`, {
      method: "POST", headers: { Authorization: await this.bearer(), "Content-Type": "application/json" },
      body: JSON.stringify({ config: { languageCode: input.languageHint ?? "en-IN", enableAutomaticPunctuation: true }, audio: { content: Buffer.from(input.bytes).toString("base64") } }),
    });
    if (!response.ok) throw new Error(`Speech-to-Text failed: ${response.status}`);
    const body = await response.json() as { results?: Array<{ alternatives?: Array<{ transcript: string; confidence?: number }> }> };
    const alternatives = (body.results ?? []).flatMap((result) => result.alternatives?.slice(0, 1) ?? []);
    return { value: alternatives.map((item) => item.transcript).join(" "), confidence: alternatives.length ? alternatives.reduce((sum, item) => sum + (item.confidence ?? 0), 0) / alternatives.length : null, sourceReferences: ["audio"], missingInformation: [], provider: "google-speech", model: "latest_long", usageUnits: input.bytes.byteLength };
  }

  async extractText(input: { bytes: Uint8Array; contentType: string }): Promise<AiSuggestion<string>> {
    if (!this.config.documentProcessorId) throw new Error("Document AI processor is not configured");
    const endpoint = `https://${this.config.location}-documentai.googleapis.com/v1/projects/${this.config.projectId}/locations/${this.config.location}/processors/${this.config.documentProcessorId}:process`;
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: await this.bearer(), "Content-Type": "application/json" }, body: JSON.stringify({ rawDocument: { content: Buffer.from(input.bytes).toString("base64"), mimeType: input.contentType } }) });
    if (!response.ok) throw new Error(`Document AI failed: ${response.status}`);
    const body = await response.json() as { document?: { text?: string; pages?: unknown[] } };
    return { value: body.document?.text ?? "", confidence: null, sourceReferences: ["document"], missingInformation: [], provider: "google-document-ai", model: this.config.documentProcessorId, usageUnits: body.document?.pages?.length ?? 1 };
  }

  async suggestBrief(input: { rawText: string; knownClients: readonly string[]; knownProjects: readonly string[] }) {
    if (!this.config.geminiEnabled) throw new Error("Gemini assistance is disabled pending residency approval");
    const model = this.config.geminiModel ?? "gemini-2.5-flash";
    const endpoint = `https://aiplatform.googleapis.com/v1/projects/${this.config.projectId}/locations/global/publishers/google/models/${model}:generateContent`;
    const prompt = `Return JSON with summary, clientId, projectId, intakeType, deliverables, tasks, missingInformation and confidence. Never invent missing facts. Known clients: ${input.knownClients.join(", ")}. Known projects: ${input.knownProjects.join(", ")}. Source:\n${input.rawText}`;
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: await this.bearer(), "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }) });
    if (!response.ok) throw new Error(`Gemini failed: ${response.status}`);
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { totalTokenCount?: number } };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as { summary?: string; clientId?: string | null; projectId?: string | null; intakeType?: string | null; deliverables?: string[]; tasks?: string[]; missingInformation?: string[]; confidence?: number };
    return { value: { summary: parsed.summary ?? "", clientId: parsed.clientId ?? null, projectId: parsed.projectId ?? null, intakeType: parsed.intakeType ?? null, deliverables: parsed.deliverables ?? [], tasks: parsed.tasks ?? [] }, confidence: parsed.confidence ?? null, sourceReferences: ["raw intake"], missingInformation: parsed.missingInformation ?? [], provider: "vertex-ai", model, usageUnits: body.usageMetadata?.totalTokenCount ?? 0 };
  }
}
