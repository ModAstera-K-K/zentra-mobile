import { spawnSync } from 'node:child_process';

import { buildAndroidEnv, printAndroidEnvSummary } from './android-env.mjs';

function runCommand(command, args, env) {
  return spawnSync(command, args, {
    env,
    stdio: 'inherit',
  });
}

function main() {
  const { adbPath, env } = buildAndroidEnv();

  if (!adbPath) {
    console.error('Unable to find adb. Install Android platform-tools or set ANDROID_SDK_ROOT correctly.');
    printAndroidEnvSummary();
    process.exit(1);
  }

  const devicesResult = runCommand(adbPath, ['devices'], env);

  if (devicesResult.status !== 0) {
    process.exit(devicesResult.status ?? 1);
  }

  const reverseResult = runCommand(adbPath, ['reverse', 'tcp:8081', 'tcp:8081'], env);

  if (reverseResult.status !== 0) {
    process.exit(reverseResult.status ?? 1);
  }

  console.log('adb reverse tcp:8081 tcp:8081 is configured.');
}

main();
