import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

import { buildAndroidEnv, getProjectRoot, printAndroidEnvSummary } from './android-env.mjs';

function runReverse(adbPath, env) {
  if (!adbPath) {
    return;
  }

  const result = spawnSync(adbPath, ['reverse', 'tcp:8081', 'tcp:8081'], {
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.warn('adb reverse failed. If you are using a physical Android device, reconnect USB and rerun `npm run android:reverse`.');
  }
}

function main() {
  const projectRoot = getProjectRoot();
  const { adbPath, env, androidSdkRoot, javaHome } = buildAndroidEnv();

  if (!androidSdkRoot || !javaHome) {
    console.error('Missing Android SDK or Java 17 environment for the dev-client workflow.');
    printAndroidEnvSummary();
    process.exit(1);
  }

  runReverse(adbPath, env);

  const expoBin = path.join(projectRoot, 'node_modules', '.bin', 'expo');
  const child = spawn(expoBin, ['start', '--dev-client', '--host', 'localhost', ...process.argv.slice(2)], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
