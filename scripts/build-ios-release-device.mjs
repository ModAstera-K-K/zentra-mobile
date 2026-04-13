import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getProjectRoot } from "./android-env.mjs";

const XCODEBUILD_LOG_PATH = ".expo/xcodebuild.log";

function hasFlag(args, flag) {
  return args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));
}

function readXcodebuildLog(projectRoot) {
  const logPath = path.join(projectRoot, XCODEBUILD_LOG_PATH);

  if (!fs.existsSync(logPath)) {
    return "";
  }

  return fs.readFileSync(logPath, "utf8");
}

function printDeveloperModeHelp(projectRoot) {
  const logPath = path.join(projectRoot, XCODEBUILD_LOG_PATH);

  console.error(
    "The selected iPhone is visible to Xcode, but Developer Mode is disabled on the device.",
  );
  console.error(
    "On the iPhone, open Settings > Privacy & Security > Developer Mode, enable it, restart the device if prompted, then reconnect and trust the Mac again.",
  );
  console.error(
    `If the next build still fails, open ${logPath} in Xcode for the full device-side log.`,
  );
}

function main() {
  const projectRoot = getProjectRoot();
  const expoBin = path.join(projectRoot, "node_modules", ".bin", "expo");
  const args = process.argv.slice(2);
  const expoArgs = ["run:ios"];

  if (!hasFlag(args, "--device")) {
    expoArgs.push("--device");
  }

  if (!hasFlag(args, "--configuration")) {
    expoArgs.push("--configuration", "Release");
  }

  expoArgs.push(...args);

  const child = spawn(expoBin, expoArgs, {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "production",
    },
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if ((code ?? 0) !== 0) {
      const combinedOutput = readXcodebuildLog(projectRoot);

      if (combinedOutput.includes("Developer Mode disabled")) {
        printDeveloperModeHelp(projectRoot);
      }
    }

    process.exit(code ?? 0);
  });
}

main();
