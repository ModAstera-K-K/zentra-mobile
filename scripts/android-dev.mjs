import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

import { buildAndroidEnv, getProjectRoot, printAndroidEnvSummary } from './android-env.mjs';

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      resolve(false);
    });
  });
}

async function waitForMetro() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isPortOpen(8081)) {
      return true;
    }

    await sleep(1000);
  }

  return false;
}

function runReverse(adbPath, env) {
  if (!adbPath) {
    return;
  }

  spawnSync(adbPath, ['reverse', 'tcp:8081', 'tcp:8081'], {
    env,
    stdio: 'inherit',
  });
}

async function main() {
  const projectRoot = getProjectRoot();
  const { adbPath, env, androidSdkRoot, javaHome } = buildAndroidEnv();

  if (!androidSdkRoot || !javaHome) {
    console.error('Missing Android SDK or Java 17 environment for the Android dev workflow.');
    printAndroidEnvSummary();
    process.exit(1);
  }

  const expoBin = path.join(projectRoot, 'node_modules', '.bin', 'expo');
  const metro = spawn(expoBin, ['start', '--dev-client', '--host', 'localhost', '--clear'], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  const metroReady = await waitForMetro();

  if (!metroReady) {
    console.error('Metro did not come up on port 8081 in time.');
    metro.kill('SIGTERM');
    process.exit(1);
  }

  runReverse(adbPath, env);

  const build = spawn(expoBin, ['run:android'], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  build.on('exit', (code) => {
    if (code === 0) {
      runReverse(adbPath, env);
      console.log('Android dev client installed. Leave this terminal open so Metro stays available.');
      return;
    }

    metro.kill('SIGTERM');
    process.exit(code ?? 1);
  });

  metro.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.exit(code);
    }
  });
}

void main();
