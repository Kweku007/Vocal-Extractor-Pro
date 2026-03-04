import type { ProcessingJob } from "@shared/schema";

export interface IStorage {
  getJob(id: string): ProcessingJob | undefined;
  createJob(job: ProcessingJob): void;
  updateJob(id: string, updates: Partial<ProcessingJob>): void;
  deleteJob(id: string): void;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, ProcessingJob>;

  constructor() {
    this.jobs = new Map();
  }

  getJob(id: string): ProcessingJob | undefined {
    return this.jobs.get(id);
  }

  createJob(job: ProcessingJob): void {
    this.jobs.set(job.id, job);
  }

  updateJob(id: string, updates: Partial<ProcessingJob>): void {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates);
    }
  }

  deleteJob(id: string): void {
    this.jobs.delete(id);
  }
}

export const storage = new MemStorage();
