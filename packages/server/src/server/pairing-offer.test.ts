import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";

import { generateLocalPairingOffer } from "./pairing-offer.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local pairing offer", () => {
  test("advertises the resolvable hosted relay alias by default", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-pairing-offer-"));
    directories.push(home);

    const pairing = await generateLocalPairingOffer({ paseoHome: home, includeQr: false });
    const parsed = parseConnectionOfferFromUrl(pairing.url!);

    expect(parsed?.relay.endpoint).toBe("relay-next.paseo.sh:443");
    expect(parsed?.relay.useTls).toBe(true);
  });
});
