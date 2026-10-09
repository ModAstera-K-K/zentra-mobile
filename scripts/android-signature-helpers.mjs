import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// apksigner labels signers differently across build-tools versions:
// "Signer #1 certificate ..." in older ones, "V2 Signer: certificate ..." in newer ones.
const SIGNER_DIGEST_PATTERN =
  /^(.*Signer.*?)certificate SHA-256 digest: ([0-9a-f]{64})$/gm;

export function parseSignerDigests(apksignerOutput) {
  const digests = [...apksignerOutput.matchAll(SIGNER_DIGEST_PATTERN)]
    .filter((match) => !match[1].startsWith("Source Stamp"))
    .map((match) => match[2]);

  return [...new Set(digests)];
}

export function certificateDigest(derBytes) {
  return createHash("sha256").update(derBytes).digest("hex");
}

export function findApksigner(androidSdkRoot) {
  if (!androidSdkRoot) {
    return null;
  }

  const buildToolsDir = path.join(androidSdkRoot, "build-tools");

  if (!fs.existsSync(buildToolsDir)) {
    return null;
  }

  const newestFirst = fs
    .readdirSync(buildToolsDir)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  for (const version of newestFirst) {
    const candidate = path.join(buildToolsDir, version, "apksigner");

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Returns the reasons an APK must not be published; empty when it is signed
 * by the expected key. With neither digest to compare against it reports that,
 * so the check can never pass without having checked anything.
 */
export function checkSignerDigests({ signerDigests, debugDigest, expectedDigest }) {
  const problems = [];

  if (signerDigests.length === 0) {
    problems.push("No signer certificate was found in the APK.");
  }

  if (!debugDigest && !expectedDigest) {
    problems.push(
      "Nothing to compare the signer against: no debug keystore and no release keystore variables.",
    );
  }

  if (debugDigest && signerDigests.includes(debugDigest)) {
    problems.push("The APK is signed with the debug key.");
  }

  if (
    expectedDigest &&
    signerDigests.some((digest) => digest !== expectedDigest)
  ) {
    problems.push(
      `The APK signer does not match the release keystore (expected ${expectedDigest}).`,
    );
  }

  return problems;
}

export function readApkSignerDigests(apksignerPath, apkPath, env = process.env) {
  const result = spawnSync(apksignerPath, ["verify", "--print-certs", apkPath], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      `apksigner could not verify ${apkPath}: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }

  return parseSignerDigests(result.stdout);
}

export function readKeystoreCertificateDigest({
  keystorePath,
  alias,
  storePassword,
  javaHome,
}) {
  const keytool = javaHome ? path.join(javaHome, "bin", "keytool") : "keytool";
  // The password goes through the environment so it never appears in argv.
  const result = spawnSync(
    keytool,
    [
      "-exportcert",
      "-keystore",
      keystorePath,
      "-alias",
      alias,
      "-storepass:env",
      "ZENTRA_KEYTOOL_STOREPASS",
    ],
    {
      env: { ...process.env, ZENTRA_KEYTOOL_STOREPASS: storePassword },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    // keytool reports its errors on stdout.
    const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
    throw new Error(
      `keytool could not read ${alias} from ${keystorePath}: ${detail}`,
    );
  }

  return certificateDigest(result.stdout);
}
