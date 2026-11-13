import { confirm, isCancel, log } from "@clack/prompts";
import { Command, InvalidArgumentError } from "commander";
import chalk from "chalk";
import { generateLocalPairingOffer } from "@getpaseo/server/pairing";
import { readDaemonInstance } from "@getpaseo/server/daemon-control";
import {
  readPersistedConfig,
  editPersistedConfig,
  resolveConfigFromPersisted,
} from "@getpaseo/server/configuration";
import { connectToDaemon } from "../../utils/client.js";
import type { DaemonTarget } from "../../utils/daemon-target.js";
import { addJsonAndDaemonHostOptions, withGlobalOptions } from "../../utils/command-options.js";
import { formatPairingInstructions } from "../../output/pairing.js";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { serializeRelayConnectionUri } from "@getpaseo/protocol/daemon-endpoints";
import {
  DEFAULT_PAIRING_ROLE,
  MAX_CLIENT_NAME_LENGTH,
  normalizeClientName,
  type PairingRole,
} from "@getpaseo/protocol/agent-actor";

interface PairOptions {
  daemonTarget: DaemonTarget;
  home?: string;
  json?: boolean;
  relay?: boolean;
  name?: string;
  role: PairingRole;
}

export interface PairCommandOutput {
  columns: number | undefined;
  writeStdout(message: string): void;
  writeStderr(message: string): void;
  setExitCode(code: number): void;
  success(message: string): void;
}

export interface PairingOffer {
  relayEnabled: boolean;
  url: string | null;
  qr: string | null;
  clientName?: string;
  role: PairingRole;
}

const PAIRING_DAEMON_RPC_TIMEOUT_MS = 1500;
const RELAY_DOCS_URL = "https://paseo.sh/docs/security";

function parseClientName(value: string): string {
  const name = normalizeClientName(value);
  if (!name) {
    throw new InvalidArgumentError("Client name must not be empty.");
  }
  if (name.length > MAX_CLIENT_NAME_LENGTH) {
    throw new InvalidArgumentError(
      `Client name must be at most ${MAX_CLIENT_NAME_LENGTH} characters.`,
    );
  }
  return name;
}

function parsePairingRole(value: string): PairingRole {
  if (value !== "admin" && value !== "member") {
    throw new InvalidArgumentError('Role must be "admin" or "member".');
  }
  return value;
}

function rejectRemovedNameFlagArgs(argv: string[]): string[] {
  if (argv.some((arg) => arg === "-name" || arg.startsWith("-name="))) {
    throw new InvalidArgumentError('Use "-n <name>" or "--name <name>".');
  }
  return argv;
}

class PairCommand extends Command {
  override parseOptions(argv: string[]): ReturnType<Command["parseOptions"]> {
    return super.parseOptions(rejectRemovedNameFlagArgs(argv));
  }
}

function createProcessOutput(): PairCommandOutput {
  return {
    columns: process.stdout.columns,
    writeStdout(message) {
      process.stdout.write(message);
    },
    writeStderr(message) {
      process.stderr.write(message);
    },
    setExitCode(code) {
      process.exitCode = code;
    },
    success(message) {
      log.success(message);
    },
  };
}

export function pairCommand(): Command {
  return addJsonAndDaemonHostOptions(
    new PairCommand("pair").description("Print the daemon pairing QR code and link"),
  )
    .option("--relay", "Enable relay without prompting")
    .option("-n, --name <name>", "Name the client receiving this pairing link", parseClientName)
    .option(
      "--role <role>",
      'Role for this client: "admin" or "member"',
      parsePairingRole,
      DEFAULT_PAIRING_ROLE,
    )
    .action(
      withGlobalOptions((options: PairOptions, _command: Command) => runPairCommand(options)),
    );
}

export async function resolveLocalPairingOffer(options: {
  paseoHome: string;
  enableRelay?: boolean;
  clientName?: string;
  role?: PairingRole;
}): Promise<PairingOffer> {
  const instance = await readDaemonInstance(options.paseoHome);
  if (instance)
    return resolveDaemonPairingOffer(
      { kind: "instance", home: options.paseoHome },
      options.enableRelay,
      options.clientName,
      options.role,
    );
  if (options.enableRelay)
    editPersistedConfig(options.paseoHome, "daemon.relay.enabled", { value: true });
  const config = resolveConfigFromPersisted(
    options.paseoHome,
    readPersistedConfig(options.paseoHome, { defaultsIfMissing: true }),
    { env: {} },
  );

  return generateLocalPairingOffer({
    paseoHome: options.paseoHome,
    relayEnabled: config.relayEnabled,
    relayEndpoint: config.relayEndpoint,
    relayPublicEndpoint: config.relayPublicEndpoint,
    relayUseTls: config.relayUseTls,
    relayPublicUseTls: config.relayPublicUseTls,
    appBaseUrl: config.appBaseUrl,
    includeQr: true,
    clientName: options.clientName,
    role: options.role,
  });
}

async function resolveDaemonPairingOffer(
  target: DaemonTarget,
  enableRelay: boolean | undefined,
  clientName: string | undefined,
  role: PairingRole | undefined,
): Promise<PairingOffer> {
  const client = await connectToDaemon({
    target,
    timeout: PAIRING_DAEMON_RPC_TIMEOUT_MS,
  });

  try {
    const serverInfo = client.getLastServerInfoMessage();
    if (serverInfo?.features?.daemonStatusRpc !== true) {
      throw new Error("Update the Paseo daemon before pairing from this command.");
    }

    let offer = await client.getDaemonPairingOffer({
      timeout: PAIRING_DAEMON_RPC_TIMEOUT_MS,
      clientName,
      role,
    });
    if (!offer.relayEnabled && enableRelay) {
      if (serverInfo.features.relayConfig !== true) {
        throw new Error("Update the Paseo daemon before enabling relay from this command.");
      }
      await client.patchDaemonConfig({ relay: { enabled: true } });
      try {
        offer = await client.getDaemonPairingOffer({
          timeout: PAIRING_DAEMON_RPC_TIMEOUT_MS,
          clientName,
          role,
        });
      } catch (error) {
        throw new Error(
          `Relay configuration was saved, but fetching the pairing offer failed: ${String(error)}`,
          { cause: error },
        );
      }
    }
    return {
      relayEnabled: offer.relayEnabled,
      url: offer.url || null,
      qr: offer.qr ?? null,
      clientName: offer.clientName,
      role: offer.role ?? role ?? DEFAULT_PAIRING_ROLE,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function confirmRelayPairing(): Promise<boolean> {
  log.message("Your connection is end-to-end encrypted. Paseo cannot read your code or messages.");
  log.message(`Learn how it works: ${RELAY_DOCS_URL}`);
  const answer = await confirm({
    message: "Enable relay to pair a device?",
    initialValue: false,
  });
  return !isCancel(answer) && answer;
}

export function printDirectConnectionGuidance(): void {
  console.log("Daemon is running with relay off.");
  console.log(
    "To connect another device directly, use the daemon's TCP address over your LAN, Tailscale, or another VPN.",
  );
  console.log(`Learn more: ${RELAY_DOCS_URL}#direct-connections`);
}

export async function runPairCommand(options: PairOptions): Promise<void> {
  const output = createProcessOutput();
  const target = options.daemonTarget;
  const resolveOffer = (enableRelay: boolean) =>
    target.kind === "instance"
      ? resolveLocalPairingOffer({
          paseoHome: target.home,
          enableRelay,
          clientName: options.name,
          role: options.role,
        })
      : resolveDaemonPairingOffer(target, enableRelay, options.name, options.role);
  const offline = target.kind === "instance" && !(await readDaemonInstance(target.home));
  const pairing = await resolveOffer(options.relay === true);

  if (offline)
    output.writeStderr(
      `Offline pairing offer. Start with: paseo daemon start --home ${JSON.stringify(target.kind === "instance" ? target.home : "")}\n`,
    );

  outputPairingResult(pairing, options, output);
}

function outputPairingResult(
  pairing: PairingOffer,
  options: PairOptions,
  output: PairCommandOutput,
): void {
  if (!pairing.relayEnabled || !pairing.url) {
    if (options.json) {
      output.writeStderr(
        `${JSON.stringify({
          code: "RELAY_DISABLED",
          message: "Relay pairing is disabled for this daemon.",
          action: "Run paseo daemon pair --relay --json to enable it explicitly.",
        })}\n`,
      );
    } else {
      output.writeStderr(`${chalk.red("Relay pairing is disabled for this daemon.")}\n`);
      output.writeStderr(`${chalk.yellow("Run paseo daemon pair --relay to enable it.")}\n`);
    }
    output.setExitCode(1);
    return;
  }

  const offer = parseConnectionOfferFromUrl(pairing.url);
  const connectionUri = offer ? serializeRelayConnectionUri({ offer }) : null;
  const clientName = offer?.clientName ?? pairing.clientName;
  const role = offer?.role ?? pairing.role;

  if (options.json) {
    output.writeStdout(
      `${JSON.stringify(
        {
          relayEnabled: pairing.relayEnabled,
          url: pairing.url,
          qr: pairing.qr,
          connectionUri,
          clientName,
          role,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  output.writeStdout(
    formatPairingInstructions({
      url: pairing.url,
      qr: pairing.qr,
      connectionUri,
      clientName,
      role,
      columns: output.columns,
    }),
  );
}
