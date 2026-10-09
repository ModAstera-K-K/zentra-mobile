import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  certificateDigest,
  checkSignerDigests,
  findApksigner,
  parseSignerDigests,
} from "../scripts/android-signature-helpers.mjs";

const RELEASE = "a".repeat(64);
const DEBUG = "b".repeat(64);

test("signer digests are read from apksigner output and nothing else", () => {
  const output = [
    "Signer #1 certificate DN: CN=Zentra",
    `Signer #1 certificate SHA-256 digest: ${RELEASE}`,
    "Signer #1 certificate SHA-1 digest: 0123456789abcdef0123456789abcdef01234567",
    `Source Stamp Signer certificate SHA-256 digest: ${DEBUG}`,
    "",
  ].join("\n");
  assert.deepEqual(parseSignerDigests(output), [RELEASE]);
  assert.deepEqual(parseSignerDigests("DOES NOT VERIFY\n"), []);

  // Newer build-tools label each signature scheme and repeat the same certificate.
  const perScheme = [
    "V2 Signer: certificate DN: CN=Zentra",
    `V2 Signer: certificate SHA-256 digest: ${RELEASE}`,
    `V3 Signer: certificate SHA-256 digest: ${RELEASE}`,
  ].join("\n");
  assert.deepEqual(parseSignerDigests(perScheme), [RELEASE]);
});

test("a debug-signed or mismatched APK is rejected, and an unchecked one never passes", () => {
  const check = (signerDigests: string[], expectedDigest: string | null, debugDigest: string | null = DEBUG) =>
    checkSignerDigests({ signerDigests, debugDigest, expectedDigest });

  assert.deepEqual(check([RELEASE], RELEASE), []);
  assert.deepEqual(check([RELEASE], null), []);
  assert.match(check([DEBUG], null).join("\n"), /debug key/);
  assert.match(check([DEBUG], RELEASE).join("\n"), /debug key/);
  assert.match(check(["c".repeat(64)], RELEASE).join("\n"), /does not match/);
  assert.match(check([], RELEASE).join("\n"), /No signer/);
  assert.match(check([RELEASE], null, null).join("\n"), /Nothing to compare/);
});

test("the certificate digest is the SHA-256 of the certificate bytes", () => {
  assert.equal(
    certificateDigest(Buffer.from("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("apksigner is taken from the newest build-tools version that has it", (context) => {
  const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zentra-sdk-"));
  context.after(() => fs.rmSync(sdkRoot, { recursive: true, force: true }));
  for (const version of ["9.0.0", "35.0.0", "36.1.0"]) {
    fs.mkdirSync(path.join(sdkRoot, "build-tools", version), { recursive: true });
  }
  assert.equal(findApksigner(sdkRoot), null);
  fs.writeFileSync(path.join(sdkRoot, "build-tools", "9.0.0", "apksigner"), "");
  fs.writeFileSync(path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"), "");
  assert.equal(
    findApksigner(sdkRoot),
    path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"),
  );
  assert.equal(findApksigner(null), null);
});
