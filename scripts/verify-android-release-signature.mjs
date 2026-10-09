import fs from "node:fs";
import path from "node:path";

import { buildAndroidEnv, getProjectRoot } from "./android-env.mjs";
import {
  checkSignerDigests,
  findApksigner,
  readApkSignerDigests,
  readKeystoreCertificateDigest,
} from "./android-signature-helpers.mjs";

const USAGE =
  "Usage: node ./scripts/verify-android-release-signature.mjs <path-to-apk>";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const apkPath = process.argv[2];

  if (!apkPath || !fs.existsSync(apkPath)) {
    fail(apkPath ? `APK not found: ${apkPath}\n${USAGE}` : USAGE);
  }

  const { androidSdkRoot, env, javaHome } = buildAndroidEnv();
  const apksignerPath = findApksigner(
    androidSdkRoot ??
      process.env.ANDROID_HOME ??
      process.env.ANDROID_SDK_ROOT,
  );

  if (!apksignerPath) {
    fail("apksigner was not found under the Android SDK build-tools directory.");
  }

  const debugKeystore = path.join(
    getProjectRoot(),
    "android",
    "app",
    "debug.keystore",
  );
  const releaseKeystore = process.env.ANDROID_KEYSTORE_PATH;
  let signerDigests;
  let debugDigest = null;
  let expectedDigest = null;

  try {
    signerDigests = readApkSignerDigests(apksignerPath, apkPath, env);

    if (fs.existsSync(debugKeystore)) {
      debugDigest = readKeystoreCertificateDigest({
        keystorePath: debugKeystore,
        alias: "androiddebugkey",
        storePassword: "android",
        javaHome,
      });
    }

    if (releaseKeystore) {
      expectedDigest = readKeystoreCertificateDigest({
        keystorePath: releaseKeystore,
        alias: process.env.ANDROID_KEY_ALIAS ?? "",
        storePassword: process.env.ANDROID_KEYSTORE_PASSWORD ?? "",
        javaHome,
      });
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const signerLine = `Signer certificate SHA-256: ${signerDigests.join(", ") || "none"}`;
  console.log(signerLine);

  if (process.env.GITHUB_OUTPUT && signerDigests.length > 0) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `signer_sha256=${signerDigests[0]}\n`,
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${signerLine}\n`);
  }

  const problems = checkSignerDigests({
    signerDigests,
    debugDigest,
    expectedDigest,
  });

  if (problems.length > 0) {
    fail(problems.join("\n"));
  }

  console.log(
    expectedDigest
      ? "The APK is signed with the release keystore."
      : "The APK is not signed with the debug key. Set the ANDROID_KEYSTORE_* variables to also confirm it matches the release keystore.",
  );
}

main();
