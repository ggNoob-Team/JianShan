import { randomUUID } from "node:crypto";
import type { LocalJobSnapshot } from "@getpaseo/protocol/messages";
import type { TerminalManager } from "../../terminal/terminal-manager.js";
import { captureTerminalLines } from "../../terminal/terminal-capture.js";
import type { TerminalExitInfo, TerminalSession } from "../../terminal/terminal.js";

interface LocalJobRecord {
  jobId: string;
  workspaceId: string;
  command: string;
  args: string[];
  status: LocalJobSnapshot["status"];
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  signal: number | null;
  error: string | null;
  session: TerminalSession;
  timeout: ReturnType<typeof setTimeout> | null;
  termination: "canceled" | "timed-out" | null;
  completed: Promise<void>;
  finish: () => void;
}

export interface LocalJobService {
  start(input: {
    workspaceId: string;
    cwd: string;
    command: string;
    args: string[];
    timeoutMs?: number;
  }): Promise<LocalJobSnapshot>;
  get(jobId: string): LocalJobSnapshot | null;
  cancel(jobId: string): Promise<LocalJobSnapshot | null>;
  wait(jobId: string, timeoutMs: number): Promise<LocalJobSnapshot | null>;
}

export interface LocalJobServiceOptions {
  terminalManager: TerminalManager;
  now?: () => number;
  createJobId?: () => string;
  maxRetainedJobs?: number;
}

const OUTPUT_TAIL_LINES = 200;

export function createLocalJobService(options: LocalJobServiceOptions): LocalJobService {
  const now = options.now ?? Date.now;
  const createJobId = options.createJobId ?? (() => `local-job-${randomUUID()}`);
  const maxRetainedJobs = options.maxRetainedJobs ?? 100;
  const jobs = new Map<string, LocalJobRecord>();

  function outputTail(record: LocalJobRecord): string[] {
    const lines = captureTerminalLines(record.session, { stripAnsi: true }).lines;
    let end = lines.length;
    while (end > 0 && lines[end - 1]?.trim() === "") {
      end -= 1;
    }
    return lines.slice(Math.max(0, end - OUTPUT_TAIL_LINES), end);
  }

  function snapshot(record: LocalJobRecord): LocalJobSnapshot {
    return {
      jobId: record.jobId,
      workspaceId: record.workspaceId,
      command: record.command,
      args: [...record.args],
      status: record.status,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      exitCode: record.exitCode,
      signal: record.signal,
      outputTail: outputTail(record),
      error: record.error,
    };
  }

  function finishRunningJob(record: LocalJobRecord, exit: TerminalExitInfo): void {
    if (record.status !== "running") {
      return;
    }
    if (record.timeout) {
      clearTimeout(record.timeout);
      record.timeout = null;
    }
    record.finishedAt = new Date(now()).toISOString();
    record.exitCode = exit.exitCode;
    record.signal = exit.signal;
    if (record.termination === "timed-out") {
      record.status = "failed";
      record.error = "Local job timed out";
    } else if (record.termination === "canceled") {
      record.status = "canceled";
      record.error = "Canceled by remote requester";
    } else if (exit.exitCode === 0) {
      record.status = "succeeded";
    } else {
      record.status = "failed";
      record.error =
        exit.exitCode === null
          ? "Local job exited without an exit code"
          : `Local job exited with code ${exit.exitCode}`;
    }
    record.finish();
  }

  function pruneCompletedJobs(): void {
    if (jobs.size < maxRetainedJobs) {
      return;
    }
    for (const [jobId, record] of jobs) {
      if (record.status !== "running") {
        jobs.delete(jobId);
      }
      if (jobs.size < maxRetainedJobs) {
        return;
      }
    }
  }

  function find(jobId: string): LocalJobRecord | null {
    return jobs.get(jobId) ?? null;
  }

  return {
    async start(input) {
      pruneCompletedJobs();
      const jobId = createJobId();
      const session = await options.terminalManager.createTerminal({
        id: jobId,
        workspaceId: input.workspaceId,
        cwd: input.cwd,
        name: `Local job ${jobId.slice(-8)}`,
        command: input.command,
        args: input.args,
      });
      let finish!: () => void;
      const completed = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const record: LocalJobRecord = {
        jobId,
        workspaceId: input.workspaceId,
        command: input.command,
        args: [...input.args],
        status: "running",
        startedAt: new Date(now()).toISOString(),
        finishedAt: null,
        exitCode: null,
        signal: null,
        error: null,
        session,
        timeout: null,
        termination: null,
        completed,
        finish: () => finish(),
      };
      jobs.set(jobId, record);

      session.onExit((exit) => finishRunningJob(record, exit));
      const existingExit = session.getExitInfo();
      if (existingExit) {
        finishRunningJob(record, existingExit);
      }
      if (input.timeoutMs !== undefined && record.status === "running") {
        record.timeout = setTimeout(() => {
          record.termination = "timed-out";
          void options.terminalManager.killTerminalAndWait(jobId).catch(() => {
            if (record.status === "running") {
              record.status = "failed";
              record.finishedAt = new Date(now()).toISOString();
              record.error = "Local job timed out";
              record.finish();
            }
          });
        }, input.timeoutMs);
      }
      if (record.status !== "running" && record.timeout) {
        clearTimeout(record.timeout);
        record.timeout = null;
      }
      return snapshot(record);
    },

    get(jobId) {
      const record = find(jobId);
      return record ? snapshot(record) : null;
    },

    async cancel(jobId) {
      const record = find(jobId);
      if (!record) {
        return null;
      }
      if (record.status !== "running") {
        return snapshot(record);
      }
      if (record.timeout) {
        clearTimeout(record.timeout);
        record.timeout = null;
      }
      record.termination = "canceled";
      await options.terminalManager.killTerminalAndWait(jobId);
      if (record.status === "running") {
        record.status = "canceled";
        record.error = "Canceled by remote requester";
        record.finishedAt = new Date(now()).toISOString();
        record.finish();
      }
      return snapshot(record);
    },

    async wait(jobId, timeoutMs) {
      const record = find(jobId);
      if (!record) {
        return null;
      }
      if (record.status !== "running") {
        return snapshot(record);
      }
      let timer: ReturnType<typeof setTimeout> | null = null;
      await Promise.race([
        record.completed,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return snapshot(record);
    },
  };
}
