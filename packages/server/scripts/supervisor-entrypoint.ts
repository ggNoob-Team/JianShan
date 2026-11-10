import { fileURLToPath } from "url";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import {
  acquirePidLock,
  PidLockError,
  releasePidLock,
  startPidLockHeartbeat,
  updatePidLock,
} from "../src/server/pid-lock.js";
import { resolvePaseoHome } from "../src/server/paseo-home.js";
import { daemonLogPath } from "../src/server/daemon-instance.js";
import { PRIVATE_FILE_MODE } from "../src/server/private-files.js";
import { loadPersistedConfig } from "../src/server/persisted-config.js";
import { runSupervisor } from "./supervisor.js";
import { resolveSupervisorLogFile } from "./supervisor-log-config.js";

process.title = "Paseo Supervisor";

interface DaemonRunnerConfig {
  devMode: boolean;
  workerArgs: string[];
}

function parseConfig(argv: string[]): DaemonRunnerConfig {
  let devMode = false;
  const workerArgs: string[] = [];

  for (const arg of argv) {
    if (arg === "--dev") {
      devMode = true;
      continue;
    }
    if (arg === "--reclaim-stale-pid-lock") {
      throw new Error(
        "--reclaim-stale-pid-lock was removed: stop the existing supervisor before starting another.",
      );
    }
    workerArgs.push(arg);
  }

  return { devMode, workerArgs };
}

function resolveWorkerEntry(): string {
  const candidates = [
    fileURLToPath(new URL("../server/server/daemon-worker.js", import.meta.url)),
    fileURLToPath(new URL("../dist/server/server/daemon-worker.js", import.meta.url)),
    fileURLToPath(new URL("../src/server/daemon-worker.ts", import.meta.url)),
    fileURLToPath(new URL("../../src/server/daemon-worker.ts", import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function resolveDevWorkerEntry(): string {
  const candidate = fileURLToPath(new URL("../src/server/daemon-worker.ts", import.meta.url));
  if (!existsSync(candidate)) {
    throw new Error(`Dev worker entry not found: ${candidate}`);
  }
  return candidate;
}

function resolveWorkerExecArgv(workerEntry: string, devMode: boolean): string[] {
  const execArgv = workerEntry.endsWith(".ts") ? ["--import", "tsx"] : [];
  if (!devMode) {
    return execArgv;
  }
  const devArgs = [
    "--heapsnapshot-near-heap-limit=3",
    "--max-old-space-size=3072",
    "--report-on-fatalerror",
    "--report-directory=/tmp/paseo-reports",
  ];
  const inspectArg = process.env.PASEO_NODE_INSPECT ?? "--inspect";
  if (inspectArg !== "0" && inspectArg !== "false" && inspectArg !== "off") {
    devArgs.push(inspectArg);
  }
  return [...devArgs, ...execArgv];
}

function resolveAdminEntry(devMode: boolean): string | null {
  const candidates = devMode
    ? [
        fileURLToPath(new URL("./admin-entrypoint.ts", import.meta.url)),
        fileURLToPath(new URL("../scripts/admin-entrypoint.ts", import.meta.url)),
      ]
    : [
        fileURLToPath(new URL("./admin-entrypoint.js", import.meta.url)),
        fileURLToPath(new URL("../scripts/admin-entrypoint.js", import.meta.url)),
        fileURLToPath(new URL("./admin-entrypoint.ts", import.meta.url)),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function createAdminSidecar(options: {
  devMode: boolean;
  workerEnv: NodeJS.ProcessEnv;
  paseoHome: string;
}) {
  const entry = resolveAdminEntry(options.devMode);
  let args: string[] = [];
  if (entry) {
    args = entry.endsWith(".ts") ? ["--import", "tsx", entry] : [entry];
  }
  let child: ChildProcess | null = null;
  let desired = false;
  let stopped = false;
  let restartTimer: NodeJS.Timeout | null = null;
  let backoffMs = 1_000;
  let selectedAdminListen = options.workerEnv.PASEO_ADMIN_LISTEN?.trim() || "";

  const spawnChild = () => {
    if (!desired || stopped || child) return;
    if (!entry) {
      process.stderr.write(
        "[Admin] Admin sidecar entry not found; management console is disabled\n",
      );
      return;
    }
    const env = {
      ...options.workerEnv,
      PASEO_HOME: options.paseoHome,
      PASEO_ADMIN_PARENT_PID: String(process.pid),
      ...(selectedAdminListen ? { PASEO_ADMIN_LISTEN: selectedAdminListen } : {}),
      ...(process.env.ELECTRON_RUN_AS_NODE === "1" ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    };
    child = spawn(process.execPath, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.once("error", (error) => {
      process.stderr.write(`[Admin] Failed to start management console: ${error.message}\n`);
    });
    child.once("exit", (code, signal) => {
      child = null;
      if (!desired || stopped) return;
      process.stderr.write(
        `[Admin] Management console exited (${signal ?? `code ${code ?? "unknown"}`}); restarting in ${backoffMs}ms\n`,
      );
      restartTimer = setTimeout(() => {
        restartTimer = null;
        spawnChild();
        backoffMs = Math.min(30_000, backoffMs * 2);
      }, backoffMs);
      restartTimer.unref();
    });
    backoffMs = 1_000;
  };

  const stop = (): void => {
    desired = false;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (child) {
      child.kill("SIGTERM");
      child = null;
    }
  };

  return {
    async start(workerListen: string): Promise<void> {
      desired = true;
      selectedAdminListen = await resolveAdminListenForWorker(
        workerListen,
        options.workerEnv.PASEO_ADMIN_LISTEN,
      );
      spawnChild();
    },
    stop,
    close(): void {
      stopped = true;
      stop();
    },
  };
}

async function resolveAdminListenForWorker(
  workerListen: string,
  configured: string | undefined,
): Promise<string> {
  const explicit = configured?.trim();
  if (explicit) return explicit;
  const match = workerListen.match(/:(\d{1,5})$/);
  const workerPort = match ? Number(match[1]) : 6767;
  const preferred = workerPort === 6767 ? 6769 : workerPort + 2;
  for (let port = preferred; port < preferred + 100 && port <= 65_535; port += 1) {
    if (await isPortAvailable("127.0.0.1", port)) return `127.0.0.1:${port}`;
  }
  throw new Error("No available port for the admin console");
}

function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

function resolvePackagedNodeEntrypointRunnerPath(currentScriptPath: string): string | null {
  const packageMarker = `${path.sep}node_modules${path.sep}@getpaseo${path.sep}server${path.sep}`;
  const markerIndex = currentScriptPath.lastIndexOf(packageMarker);
  if (markerIndex === -1) {
    return null;
  }

  const appRoot = currentScriptPath.slice(0, markerIndex);
  const runnerPath = path.join(appRoot, "dist", "daemon", "node-entrypoint-runner.js");
  return existsSync(runnerPath) ? runnerPath : null;
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2));
  const workerEntry = config.devMode ? resolveDevWorkerEntry() : resolveWorkerEntry();
  const workerExecArgv = resolveWorkerExecArgv(workerEntry, config.devMode);
  const workerEnv: NodeJS.ProcessEnv = { ...process.env };
  const packagedNodeEntrypointRunner =
    process.env.ELECTRON_RUN_AS_NODE === "1"
      ? resolvePackagedNodeEntrypointRunnerPath(fileURLToPath(import.meta.url))
      : null;

  const paseoHome = resolvePaseoHome(workerEnv);
  const adminSidecar = createAdminSidecar({
    devMode: config.devMode,
    workerEnv,
    paseoHome,
  });
  const persistedConfig = loadPersistedConfig(paseoHome);
  const supervisorLogFile = resolveSupervisorLogFile(paseoHome, persistedConfig, workerEnv);

  try {
    await acquirePidLock(paseoHome, null, {
      ownerPid: process.pid,
    });
  } catch (error) {
    if (error instanceof PidLockError) {
      failStartup(error.message, error.message);
    }
    throw error;
  }

  let lockReleased = false;
  let requestSupervisorShutdown: ((reason: string) => void) | null = null;
  const stopLockHeartbeat = startPidLockHeartbeat(paseoHome, {
    ownerPid: process.pid,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`PID lock heartbeat failed: ${message}\n`);
      if (error instanceof PidLockError) {
        requestSupervisorShutdown?.("pid_lock_ownership_lost");
      }
    },
  });
  const releaseLock = async (): Promise<void> => {
    if (lockReleased) {
      return;
    }
    lockReleased = true;
    stopLockHeartbeat();
    await releasePidLock(paseoHome, {
      ownerPid: process.pid,
    });
  };

  const supervisor = runSupervisor({
    name: "DaemonRunner",
    startupMessage: "Starting daemon worker (IPC restart and crash restart enabled)",
    resolveWorkerEntry: () => workerEntry,
    workerArgs: config.workerArgs,
    workerEnv,
    workerExecArgv,
    resolveWorkerSpawnSpec: packagedNodeEntrypointRunner
      ? (resolvedWorkerEntry) => ({
          command: process.execPath,
          args: [
            packagedNodeEntrypointRunner,
            "node-script",
            resolvedWorkerEntry,
            ...config.workerArgs,
          ],
          env: {
            ...workerEnv,
            ELECTRON_RUN_AS_NODE: "1",
          },
        })
      : undefined,
    restartOnCrash: true,
    logFile: supervisorLogFile,
    onWorkerReady: async ({ listen, serverId }) => {
      await updatePidLock(paseoHome, { listen, serverId }, { ownerPid: process.pid });
      await adminSidecar.start(listen);
    },
    onWorkerExit: async () => {
      adminSidecar.stop();
      await updatePidLock(paseoHome, { listen: null, serverId: null }, { ownerPid: process.pid });
    },
    onSupervisorExit: async () => {
      adminSidecar.close();
      await releaseLock();
    },
  });
  requestSupervisorShutdown = supervisor.requestShutdown;
}

// The supervisor opens its log only after config and the PID lock succeed. A background
// launch discards stderr, so earlier failures also go to the log the launcher points at.
function failStartup(detail: string, summary: string): never {
  process.stderr.write(`${detail}\n`);
  try {
    const logPath = daemonLogPath(resolvePaseoHome(process.env));
    mkdirSync(path.dirname(logPath), { recursive: true });
    appendFileSync(
      logPath,
      `${JSON.stringify({
        level: "fatal",
        time: new Date().toISOString(),
        pid: process.pid,
        name: "DaemonRunner",
        msg: summary,
      })}\n`,
      { mode: PRIVATE_FILE_MODE },
    );
  } catch {
    // stderr already carries the failure.
  }
  process.exit(1);
}

void main().catch((error) => {
  if (error instanceof Error) failStartup(error.stack ?? error.message, error.message);
  failStartup(String(error), String(error));
});
