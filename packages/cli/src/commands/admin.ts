import { Command } from "commander";

import {
  ensureAdminKey,
  formatAdminListen,
  readAdminServerInfo,
  resolveAdminListen,
  resolveAdminUrl,
  rotateAdminKey,
  startAdminServer,
} from "@getpaseo/server/admin";

import { withOutput, type CommandOptions } from "../output/index.js";
import { addJsonAndDaemonHostOptions } from "../utils/command-options.js";

export function createAdminCommand(): Command {
  const command = new Command("admin").description("Manage the local Paseo admin console");

  command
    .command("url")
    .description("Print the local admin console URL")
    .action(
      withOutput(async (options: CommandOptions, _command: Command) => {
        const home = requireLocalHome(options);
        const running = await readAdminServerInfo(home);
        const url = running?.url ?? resolveAdminUrl(resolveAdminListen());
        return single("url", url);
      }),
    );

  command
    .command("key")
    .description("Print the admin login key, creating it on first use")
    .action(
      withOutput(async (options: CommandOptions, _command: Command) => {
        const key = await ensureAdminKey(requireLocalHome(options));
        return single("key", key);
      }),
    );

  command
    .command("rotate-key")
    .description("Rotate the admin login key and invalidate existing console sessions")
    .action(
      withOutput(async (options: CommandOptions, _command: Command) => {
        const key = await rotateAdminKey(requireLocalHome(options));
        return single("key", key);
      }),
    );

  command
    .command("serve")
    .description("Run the admin console sidecar in the foreground")
    .option("--listen <host:port>", "Override the admin listen address")
    .action(
      withOutput(async (options: CommandOptions & { listen?: string }, _command: Command) => {
        const home = requireLocalHome(options);
        const listen = options.listen
          ? {
              host: options.listen.slice(0, options.listen.lastIndexOf(":")),
              port: Number(options.listen.slice(options.listen.lastIndexOf(":") + 1)),
            }
          : resolveAdminListen();
        if (!listen.host || !Number.isInteger(listen.port)) {
          throw new Error("--listen requires a host:port value");
        }
        const server = await startAdminServer({ paseoHome: home, listen });
        await new Promise<void>((resolve) => {
          process.once("SIGINT", resolve);
          process.once("SIGTERM", resolve);
        });
        await server.close();
        return single("listen", formatAdminListen(server.listen));
      }),
    );

  return addJsonAndDaemonHostOptions(command);
}

function requireLocalHome(options: CommandOptions): string {
  if (options.daemonTarget.kind !== "instance") {
    throw new Error("The admin console is a local operation; use --home instead of --host.");
  }
  return options.daemonTarget.home;
}

function single(idField: string, value: string) {
  return {
    type: "single" as const,
    data: value,
    schema: {
      idField: () => value,
      columns: [],
      renderHuman: () => (idField === "url" ? `Admin console: ${value}` : value),
    },
  };
}
