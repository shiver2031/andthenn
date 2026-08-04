import type { JobHandler } from "./runner.js";

interface HandlerServices {
  reconcileGmail: (cursor: string) => Promise<void>;
  processIntake: (intakeItemId: string) => Promise<void>;
  processMedia: (fileVersionId: string) => Promise<void>;
  deliverNotification: (deliveryId: string) => Promise<void>;
  runRetention: (organizationId: string) => Promise<void>;
  runArchive: (archiveJobId: string) => Promise<void>;
}

function requireString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>)[key] !== "string") throw new Error(`Job payload requires ${key}`);
  return (payload as Record<string, string>)[key]!;
}

export function createHandlers(services: HandlerServices): Record<string, JobHandler> {
  return {
    "gmail.reconcile": (job) => services.reconcileGmail(requireString(job.payload, "historyCursor")),
    "intake.process": (job) => services.processIntake(requireString(job.payload, "intakeItemId")),
    "media.process": (job) => services.processMedia(requireString(job.payload, "fileVersionId")),
    "notification.deliver": (job) => services.deliverNotification(requireString(job.payload, "deliveryId")),
    "retention.run": (job) => services.runRetention(requireString(job.payload, "organizationId")),
    "archive.run": (job) => services.runArchive(requireString(job.payload, "archiveJobId")),
  };
}
