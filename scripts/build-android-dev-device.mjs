import { spawn } from "node:child_process";
import path from "node:path";

import { buildAndroidEnv, getProjectRoot } from "./android-env.mjs";

function main() {
  const projectRoot = getProjectRoot();
  const { env } = buildAndroidEnv();
  const scriptPath = path.join(projectRoot, "scripts", "android-dev.mjs");
  const child = spawn(
    process.execPath,
    [scriptPath, ...process.argv.slice(2)],
    {
      cwd: projectRoot,
      env,
      stdio: "inherit",
    },
  );

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main();
