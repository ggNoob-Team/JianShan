import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
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
    await mkdir(home, { recursive: true });
    await writeFile(
      path.join(home, "config.json"),
      JSON.stringify({ version: 1, daemon: { relay: { enabled: false } } }),
    );
    expect(await resolveLocalPairingOffer({ paseoHome: home })).toMatchObject({
      relayEnabled: false,
      url: null,
    });
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

test("offline pairing carries the requested admin role in the link", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-role-pair-"));
  const home = path.join(root, "home");
  try {
    const offer = await resolveLocalPairingOffer({
      paseoHome: home,
      enableRelay: true,
      clientName: "Team admin",
      role: "admin",
    });

    expect(offer.role).toBe("admin");
    expect(parseConnectionOfferFromUrl(offer.url ?? "")?.role).toBe("admin");
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

test("defaults the pairing role to member and accepts --role admin", () => {
  const defaultRole = pairCommand();
  defaultRole.parseOptions(["--name", "Team member"]);
  expect(defaultRole.opts()).toMatchObject({ name: "Team member", role: "member" });

  const admin = pairCommand();
  admin.parseOptions(["--name", "Team admin", "--role", "admin"]);
  expect(admin.opts()).toMatchObject({ name: "Team admin", role: "admin" });
});

test.each([["-name", "Harmony Emulator"], ["-name=Living Room Tablet"]])(
  "rejects the removed %s form",
  (...args) => {
    const command = pairCommand();
    expect(() => command.parseOptions(args)).toThrow('Use "-n <name>" or "--name <name>".');
  },
);
