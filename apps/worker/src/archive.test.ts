import { describe, expect, it } from "vitest";
import { archiveDestinationKey } from "./archive.js";

describe("archive destination", () => {
  it("keeps approved files under a stable version path", () => {
    expect(archiveDestinationKey("archive/org/o1/projects/p1/", "v1", "Final master (approved).mp4")).toBe("archive/org/o1/projects/p1/approved/v1/Final-master-approved-.mp4");
  });

  it("rejects traversal and non-archive prefixes", () => {
    expect(() => archiveDestinationKey("org/o1/projects/p1", "v1", "a.pdf")).toThrow(/prefix/i);
    expect(() => archiveDestinationKey("archive/org/o1/../escape", "v1", "a.pdf")).toThrow(/prefix/i);
  });
});
