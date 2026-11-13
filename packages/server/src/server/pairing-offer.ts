import type { Logger } from "pino";

import {
  normalizeClientName,
  resolvePairingRole,
  type PairingRole,
} from "@getpaseo/protocol/agent-actor";
import { DEFAULT_HOSTED_RELAY_CLIENT_ENDPOINT } from "@getpaseo/protocol/daemon-endpoints";

import { createConnectionOfferV2, encodeOfferToFragmentUrl } from "./connection-offer.js";
import { loadOrCreateDaemonKeyPair } from "./daemon-keypair.js";
import { renderPairingQr } from "./pairing-qr.js";
import { getOrCreateServerId } from "./server-id.js";

export interface LocalPairingOffer {
  relayEnabled: boolean;
  url: string | null;
  qr: string | null;
  clientName?: string;
  role: PairingRole;
}

export async function generateLocalPairingOffer(args: {
  paseoHome: string;
  relayEnabled?: boolean;
  relayEndpoint?: string;
  relayPublicEndpoint?: string;
  relayUseTls?: boolean;
  relayPublicUseTls?: boolean;
  appBaseUrl?: string;
  includeQr?: boolean;
  clientName?: string;
  role?: PairingRole;
  logger?: Logger;
}): Promise<LocalPairingOffer> {
  const relayEnabled = args.relayEnabled ?? true;
  const clientName = normalizeClientName(args.clientName);
  const role = resolvePairingRole(args.role);
  if (!relayEnabled) {
    return {
      relayEnabled: false,
      url: null,
      qr: null,
      role,
    };
  }

  const relayEndpoint = args.relayEndpoint ?? "relay.paseo.sh:443";
  const relayPublicEndpoint =
    args.relayPublicEndpoint ??
    (relayEndpoint === "relay.paseo.sh:443" ? DEFAULT_HOSTED_RELAY_CLIENT_ENDPOINT : relayEndpoint);
  const relayUseTls = args.relayUseTls ?? relayEndpoint === "relay.paseo.sh:443";
  const relayPublicUseTls = args.relayPublicUseTls ?? relayUseTls;
  const appBaseUrl = args.appBaseUrl ?? "https://paseo-app-8wq.pages.dev";
  const serverId = getOrCreateServerId(args.paseoHome, { logger: args.logger });
  const daemonKeyPair = await loadOrCreateDaemonKeyPair(args.paseoHome, args.logger);
  const offer = await createConnectionOfferV2({
    serverId,
    daemonPublicKeyB64: daemonKeyPair.publicKeyB64,
    relay: { endpoint: relayPublicEndpoint, useTls: relayPublicUseTls },
    clientName,
    role,
  });
  const url = encodeOfferToFragmentUrl({ offer, appBaseUrl });

  if (args.includeQr === false) {
    return {
      relayEnabled: true,
      url,
      qr: null,
      ...(clientName ? { clientName } : {}),
      role,
    };
  }

  let qr: string | null = null;
  try {
    qr = await renderPairingQr(url);
  } catch (error) {
    args.logger?.debug({ error }, "Failed to render pairing QR");
  }

  return {
    relayEnabled: true,
    url,
    qr,
    ...(clientName ? { clientName } : {}),
    role,
  };
}
