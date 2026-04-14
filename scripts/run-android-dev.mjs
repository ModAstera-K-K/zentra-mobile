import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

import { buildAndroidEnv, getProjectRoot, printAndroidEnvSummary } from './android-env.mjs';

function runBestEffortReverse(adbPath, env) {
  if (!adbPath) {
    return;
  }

  spawnSync(adbPath, ['reverse', 'tcp:8081', 'tcp:8081'], {
    env,
    stdio: 'inherit',
  });
}

function main() {
  const projectRoot = getProjectRoot();
  const { adbPath, env, androidSdkRoot, javaHome } = buildAndroidEnv();

  if (!androidSdkRoot || !javaHome) {
    console.error('Missing Android SDK or Java 17 environment for the Android build.');
    printAndroidEnvSummary();
    process.exit(1);
  }

  runBestEffortReverse(adbPath, env);

  const expoBin = path.join(projectRoot, 'node_modules', '.bin', 'expo');
  const child = spawn(expoBin, ['run:android', ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: { ...env, APP_VARIANT: 'development' },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code === 0) {
      runBestEffortReverse(adbPath, env);
    }

    process.exit(code ?? 0);
  });
}

main();
