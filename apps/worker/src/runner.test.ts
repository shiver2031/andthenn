import { expect, it } from "vitest";
import type { JobEnvelope, JobQueue } from "@andthenn/domain";
import { DurableWorker } from "./runner.js";

it("completes idempotent jobs after the handler succeeds", async () => {
  const completed: string[] = [];
  const job: JobEnvelope<Record<string, never>> = { id: "00000000-0000-4000-8000-000000000001", queue: "intake", queueMessageId: "1", type: "test", idempotencyKey: "once", correlationId: "corr", attempts: 0, payload: {} };
  let claims = 0;
  const queue: JobQueue = {
    enqueue: async () => {}, claim: async <T>() => claims++ === 0 ? [job as JobEnvelope<T>] : [], complete: async (value) => { completed.push(value.id); }, retry: async () => {}, fail: async () => {}, health: async () => ({ queues: [] }),
  };
  const workerRef: { current: DurableWorker | null } = { current: null };
  const worker = new DurableWorker(queue, { test: async () => { workerRef.current?.stop(); } }, { queues: ["intake"], visibilitySeconds: 10, batchSize: 1, maxAttempts: 3, idleDelayMs: 1 });
  workerRef.current = worker;
  await worker.run();
  expect(completed).toEqual([job.id]);
});
