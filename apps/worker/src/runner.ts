import type { JobEnvelope, JobQueue } from "@andthenn/domain";

export type JobHandler<T = unknown> = (job: JobEnvelope<T>) => Promise<void>;
export interface RunnerOptions { queues: readonly string[]; visibilitySeconds: number; batchSize: number; maxAttempts: number; idleDelayMs: number; }

export class DurableWorker {
  private stopping = false;
  constructor(private readonly queue: JobQueue, private readonly handlers: Readonly<Record<string, JobHandler>>, private readonly options: RunnerOptions) {}

  stop() { this.stopping = true; }

  private async process(job: JobEnvelope) {
    const handler = this.handlers[job.type];
    if (!handler) { await this.queue.fail(job, `No handler registered for ${job.type}`); return; }
    try {
      await handler(job);
      await this.queue.complete(job);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown job failure";
      if (job.attempts + 1 >= this.options.maxAttempts) await this.queue.fail(job, reason);
      else await this.queue.retry(job, Math.min(900, 2 ** job.attempts * 15), reason);
    }
  }

  async run() {
    while (!this.stopping) {
      let claimed = 0;
      for (const name of this.options.queues) {
        const jobs = await this.queue.claim(name, this.options.visibilitySeconds, this.options.batchSize);
        claimed += jobs.length;
        await Promise.allSettled(jobs.map((job) => this.process(job)));
      }
      if (!claimed) await new Promise((resolve) => setTimeout(resolve, this.options.idleDelayMs));
    }
  }
}
