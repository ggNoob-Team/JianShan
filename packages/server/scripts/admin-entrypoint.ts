import pino from "pino";

import { startAdminServer } from "../src/server/admin/index.js";
import { resolvePaseoHome } from "../src/server/paseo-home.js";

process.title = "JianShan Admin";

const paseoHome = resolvePaseoHome();
const logger = pino({ name: "jianshan-admin" });
const parentPid = Number(process.env.PASEO_ADMIN_PARENT_PID || process.ppid);
let stopping = false;
const server = await startAdminServer({ paseoHome, logger });

const stop = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Stopping admin console");
  await server.close().catch((error) => logger.warn({ err: error }, "Admin console close failed"));
  process.exit(0);
};

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));

const parentCheck = setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch {
    void stop("parent_exited");
  }
}, 2_000);
parentCheck.unref();
