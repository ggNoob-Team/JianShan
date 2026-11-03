import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "vitest";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { pairCommand, resolveLocalPairingOffer } from "./pair.js";

test("offline pairing requires relay consent and saves it in the selected home", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-offline-pair-"));
  const home = path.join(root, "home");
  try {
    expect(await resolveLocalPairingOffer({ paseoHome: home })).toMatchObject({
      relayEnabled: false,
      url: null,
    });
    expect(existsSync(home)).toBe(false);
    const offer = await resolveLocalPairingOffer({ paseoHome: home, enableRelay: true });
    expect(offer.relayEnabled).toBe(true);
    expect(offer.url).toContain("offer=");
    expect(
      JSON.parse(await readFile(path.join(home, "config.json"), "utf8")).daemon.relay.enabled,
    ).toBe(true);
    expect(existsSync(path.join(home, "server-id"))).toBe(true);
    expect(existsSync(path.join(home, "daemon-keypair.json"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("offline pairing carries the requested client name in the link", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-named-pair-"));
  const home = path.join(root, "home");
  try {
    const offer = await resolveLocalPairingOffer({
      paseoHome: home,
      enableRelay: true,
      clientName: "  Harmony Emulator  ",
    });

    expect(offer.clientName).toBe("Harmony Emulator");
    expect(parseConnectionOfferFromUrl(offer.url ?? "")?.clientName).toBe("Harmony Emulator");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts the standard -n and --name forms", () => {
  const command = pairCommand();
  command.parseOptions(["-n", "Harmony Emulator"]);
  expect(command.opts()).toMatchObject({ name: "Harmony Emulator" });

  const longForm = pairCommand();
  longForm.parseOptions(["--name", "Living Room Tablet"]);
  expect(longForm.opts()).toMatchObject({ name: "Living Room Tablet" });
});

test.each([["-name", "Harmony Emulator"], ["-name=Living Room Tablet"]])(
  "rejects the removed %s form",
  (...args) => {
    const command = pairCommand();
    expect(() => command.parseOptions(args)).toThrow('Use "-n <name>" or "--name <name>".');
  },
);
