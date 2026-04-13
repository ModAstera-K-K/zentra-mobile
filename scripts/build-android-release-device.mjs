import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  buildAndroidEnv,
  getProjectRoot,
  printAndroidEnvSummary,
} from "./android-env.mjs";

const APP_ID = "com.modastera.zentra";
const RELEASE_SIGNING_ENV_VARS = [
  "ANDROID_KEYSTORE_PATH",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];

function consumeBooleanFlag(args, flag) {
  const nextArgs = [];
  let enabled = false;

  for (const arg of args) {
    if (arg === flag) {
      enabled = true;
      continue;
    }

    nextArgs.push(arg);
  }

  return { args: nextArgs, enabled };
}

function getConnectedDeviceCount(adbPath, env) {
  if (!adbPath) {
    return 0;
  }

  const result = spawnSync(adbPath, ["devices"], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    return 0;
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("List of devices attached") &&
        /\sdevice$/.test(line),
    ).length;
}

function isPackageInstalled(adbPath, env, packageName) {
  if (!adbPath) {
    return false;
  }

  const result = spawnSync(adbPath, ["shell", "pm", "path", packageName], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "ignore"],
  });

  return result.status === 0 && result.stdout.includes("package:");
}

function uninstallPackage(adbPath, env, packageName) {
  const result = spawnSync(adbPath, ["uninstall", packageName], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result.status === 0;
}

function printSignatureMismatchHelp() {
  console.error(
    `A different-signed ${APP_ID} build is already installed on the target device.`,
  );
  console.error(
    `Either uninstall it first with \`adb uninstall ${APP_ID}\` or rerun this command with \`-- --replace-installed\`.`,
  );
  console.error(
    "Uninstalling the existing app removes its on-device data unless you have already exported it.",
  );
}

function validateReleaseSigningEnv() {
  const missing = RELEASE_SIGNING_ENV_VARS.filter((name) => !process.env[name]);

  if (missing.length === 0) {
    return;
  }

  console.error(
    `Missing Android release signing variables: ${missing.join(", ")}`,
  );
  console.error(
    "See docs/android-release.md for the required export commands.",
  );
  process.exit(1);
}

function main() {
  const optionResult = consumeBooleanFlag(
    process.argv.slice(2),
    "--replace-installed",
  );
  const projectRoot = getProjectRoot();
  const { adbPath, env, androidSdkRoot, javaHome } = buildAndroidEnv();
  const releaseEnv = { ...env, NODE_ENV: env.NODE_ENV ?? "production" };

  if (!androidSdkRoot || !javaHome) {
    console.error(
      "Missing Android SDK or Java 17 environment for the Android release-device build.",
    );
    printAndroidEnvSummary();
    process.exit(1);
  }

  validateReleaseSigningEnv();

  const connectedDeviceCount = getConnectedDeviceCount(adbPath, env);

  if (connectedDeviceCount === 0) {
    console.error(
      "No connected Android device detected. Connect a USB device or start an emulator, then retry.",
    );
    process.exit(1);
  }

  if (connectedDeviceCount > 1 && !process.env.ANDROID_SERIAL) {
    console.warn(
      "Multiple Android devices detected. Set ANDROID_SERIAL to target one device explicitly if installRelease picks the wrong target.",
    );
  }

  if (optionResult.enabled && !adbPath) {
    console.error("adb is required when using --replace-installed.");
    process.exit(1);
  }

  if (optionResult.enabled && isPackageInstalled(adbPath, releaseEnv, APP_ID)) {
    console.log(
      `Uninstalling existing ${APP_ID} before installing the release build.`,
    );

    if (!uninstallPackage(adbPath, releaseEnv, APP_ID)) {
      console.error(`Failed to uninstall existing ${APP_ID}.`);
      process.exit(1);
    }
  }

  const gradlePath = path.join(projectRoot, "android", "gradlew");
  const gradleResult = spawnSync(
    gradlePath,
    [
      "-p",
      "android",
      "installRelease",
      "-Pzentra.requireReleaseSigning=true",
      ...optionResult.args,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: releaseEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (gradleResult.stdout) {
    process.stdout.write(gradleResult.stdout);
  }

  if (gradleResult.stderr) {
    process.stderr.write(gradleResult.stderr);
  }

  if (gradleResult.status !== 0) {
    const combinedOutput = `${gradleResult.stdout ?? ""}\n${gradleResult.stderr ?? ""}`;

    if (combinedOutput.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
      printSignatureMismatchHelp();
    }

    process.exit(gradleResult.status ?? 1);
  }

  const apkPath = path.join(
    projectRoot,
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    "release",
    "app-release.apk",
  );

  if (fs.existsSync(apkPath)) {
    console.log(`Installed release APK from ${apkPath}`);
  }

  if (adbPath) {
    spawnSync(
      adbPath,
      [
        "shell",
        "monkey",
        "-p",
        APP_ID,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
      ],
      {
        env: releaseEnv,
        stdio: "inherit",
      },
    );
  }
}

main();
