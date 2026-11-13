import { describe, expect, it } from "vitest";

import {
  ConnectionOfferSchema,
  decodeOfferFragmentPayload,
  parseConnectionOfferFromUrl,
} from "./connection-offer.js";

function encodeBase64UrlNoPadUtf8(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("connection offer", () => {
  it("decodes base64url JSON payloads", () => {
    const payload = {
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.paseo.sh:443" },
    };

    expect(decodeOfferFragmentPayload(encodeBase64UrlNoPadUtf8(JSON.stringify(payload)))).toEqual(
      payload,
    );
  });

  it("parses connection offers from QR-style URLs", () => {
    const offer = ConnectionOfferSchema.parse({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.paseo.sh:443" },
    });
    const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(offer));

    expect(parseConnectionOfferFromUrl(`https://app.paseo.sh/#offer=${encoded}`)).toEqual(offer);
  });

  it("round-trips the paired client name", () => {
    const offer = ConnectionOfferSchema.parse({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      clientName: "Harmony Emulator",
      relay: { endpoint: "relay.paseo.sh:443" },
    });
    const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(offer));

    expect(parseConnectionOfferFromUrl(`https://app.paseo.sh/#offer=${encoded}`)).toMatchObject({
      clientName: "Harmony Emulator",
    });
  });

  it("round-trips the paired role", () => {
    const offer = ConnectionOfferSchema.parse({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      clientName: "Team admin",
      role: "admin",
      relay: { endpoint: "relay.paseo.sh:443" },
    });
    const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(offer));

    expect(parseConnectionOfferFromUrl(`https://app.paseo.sh/#offer=${encoded}`)).toMatchObject({
      clientName: "Team admin",
      role: "admin",
    });
  });

  it("leaves relay TLS unset when absent", () => {
    expect(
      ConnectionOfferSchema.parse({
        v: 2,
        serverId: "server-123",
        daemonPublicKeyB64: "pubkey",
        relay: { endpoint: "relay.example.com:80" },
      }),
    ).toEqual({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.example.com:80" },
    });
  });

  it("round-trips relay TLS in offers without rejecting extra relay fields", () => {
    const offer = ConnectionOfferSchema.parse({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.example.com:443", useTls: true, extra: "future" },
    });
    const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(offer));

    expect(parseConnectionOfferFromUrl(`https://app.paseo.sh/#offer=${encoded}`)).toEqual({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.example.com:443", useTls: true },
    });
  });

  it("returns null when the URL has no offer fragment", () => {
    expect(parseConnectionOfferFromUrl("https://app.paseo.sh/pair")).toBeNull();
  });
});
