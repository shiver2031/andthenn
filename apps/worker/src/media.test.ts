import { describe, expect, it } from "vitest";
import { validateMediaInspection } from "./media.js";

const valid = { expectedSize: 42, expectedChecksum: "abc", declaredContentType: "video/mp4", actualSize: 42, actualChecksum: "abc", inspection: { clean: true, detectedContentType: "video/mp4" } };

describe("media validation", () => {
  it("accepts matching clean media", () => expect(() => validateMediaInspection(valid)).not.toThrow());
  it("rejects length, checksum, malware and MIME-family mismatches", () => {
    expect(() => validateMediaInspection({ ...valid, actualSize: 41 })).toThrow(/length/);
    expect(() => validateMediaInspection({ ...valid, actualChecksum: "different" })).toThrow(/checksum/);
    expect(() => validateMediaInspection({ ...valid, inspection: { ...valid.inspection, clean: false } })).toThrow(/Malware/);
    expect(() => validateMediaInspection({ ...valid, inspection: { ...valid.inspection, detectedContentType: "image/png" } })).toThrow(/type/);
  });
});
