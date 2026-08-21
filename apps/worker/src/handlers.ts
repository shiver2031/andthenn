import type { JobHandler } from "./runner.js";

interface HandlerServices {
  reconcileGmail: (payload: unknown) => Promise<void>;
  processIntake: (payload: unknown) => Promise<void>;
  processMedia: (fileVersionId: string) => Promise<void>;
  deliverNotification: (deliveryId: string) => Promise<void>;
  deliverReviewShare: (payload: unknown) => Promise<void>;
  expireReviewShare: (reviewShareId: string) => Promise<void>;
  sendRightsExpiryAlert: (payload: unknown) => Promise<void>;
  runRetention: (organizationId: string) => Promise<void>;
  runArchive: (archiveJobId: string) => Promise<void>;
  syncCalendar: (syncId: string) => Promise<void>;
}

function requireString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>)[key] !== "string") throw new Error(`Job payload requires ${key}`);
  return (payload as Record<string, string>)[key]!;
}

export function createHandlers(services: HandlerServices): Record<string, JobHandler> {
  return {
    "gmail.reconcile": (job) => services.reconcileGmail(job.payload),
    "intake.process": (job) => services.processIntake(job.payload),
    "media.process": (job) => services.processMedia(requireString(job.payload, "fileVersionId")),
    "notification.deliver": (job) => services.deliverNotification(requireString(job.payload, "deliveryId")),
    "review.share_deliver": (job) => services.deliverReviewShare(job.payload),
    "review.share_expire": (job) => services.expireReviewShare(requireString(job.payload, "reviewShareId")),
    "rights.expiry_alert": (job) => services.sendRightsExpiryAlert(job.payload),
    "retention.run": (job) => services.runRetention(requireString(job.payload, "organizationId")),
    "archive.run": (job) => services.runArchive(requireString(job.payload, "archiveJobId")),
    "calendar.sync": (job) => services.syncCalendar(requireString(job.payload, "syncId")),
  };
}
