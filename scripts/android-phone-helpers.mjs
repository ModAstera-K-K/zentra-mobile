import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP_ID = 'com.modastera.zentra';

export function parsePhoneOptions(args) {
  const options = { serial: process.env.ANDROID_SERIAL, check: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--device' && args[i + 1] && !args[i + 1].startsWith('-')) {
      options.serial = args[++i];
    } else throw new Error(`Unknown or incomplete option: ${arg}. Use --help.`);
  }
  return options;
}

export function runPhoneCommand(command, args, env, cwd, capture = false) {
  const result = spawnSync(command, args, {
    env, cwd, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() : '';
    throw new Error(`${path.basename(command)} failed (${result.signal ?? result.status}). ${detail}`);
  }
  return result.stdout ?? '';
}

export function selectPhone(output, requested) {
  const devices = output.split('\n').map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => ['device', 'unauthorized', 'offline', 'no'].includes(state));
  const selected = requested ? devices.filter(([serial]) => serial === requested) : devices;
  if (!selected.length) throw new Error(requested
    ? `Device ${requested} is not connected. Check the USB connection and USB debugging.`
    : 'No Android device found. Connect your phone, enable USB debugging, and accept its authorization prompt.');
  if (selected.length > 1) throw new Error(
    `Multiple devices found: ${selected.map(([serial, state]) => `${serial} (${state})`).join(', ')}. Select one with --device SERIAL.`,
  );
  const [serial, state] = selected[0];
  if (state !== 'device') throw new Error(
    `Device ${serial} is ${state === 'no' ? 'inaccessible' : state}. Unlock it, accept USB debugging authorization, or reconnect it.`,
  );
  return serial;
}

export function checkPhoneSetup(setup, requested, run = runPhoneCommand) {
  const { adbPath, javaHome, androidSdkRoot, env, projectRoot } = setup;
  if (!javaHome) throw new Error('Java 17 was not found. Install JDK 17 or set JAVA_HOME to its installation.');
  if (!androidSdkRoot || !adbPath) throw new Error('Android SDK was not found. Install it with Android Studio or set ANDROID_HOME.');
  // java -version writes to stderr, so use the release metadata for the exact major version.
  const release = fs.readFileSync(path.join(javaHome, 'release'), 'utf8');
  if (!/^JAVA_VERSION="17(?:[.\-"])/m.test(release)) throw new Error('This build needs Java 17. Set JAVA_HOME to your JDK 17 installation.');
  if (!fs.existsSync(path.join(projectRoot, 'node_modules', 'react-native', 'package.json'))) {
    throw new Error('Dependencies are missing. Run npm ci in the project directory first.');
  }
  return selectPhone(run(adbPath, ['devices'], env, projectRoot, true), requested);
}

export function installOnPhone(setup, serial, run = runPhoneCommand) {
  const { projectRoot, env, adbPath } = setup;
  const buildEnv = {
    ...env, NODE_ENV: 'production', ANDROID_SERIAL: serial,
    EXPO_PUBLIC_LOCAL_PERF: env.EXPO_PUBLIC_LOCAL_PERF ?? '1',
  };
  console.log(`Building Release for ${serial}; local performance logging=${buildEnv.EXPO_PUBLIC_LOCAL_PERF}.`);
  run(path.join(projectRoot, 'android', 'gradlew'),
    ['-p', 'android', ':app:assembleRelease', '--console=plain'], buildEnv, projectRoot);
  const apk = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  console.log('Installing the release APK…');
  try {
    const output = run(adbPath, ['-s', serial, 'install', '-r', apk], buildEnv, projectRoot, true);
    console.log(output.trim());
  } catch (error) {
    if (String(error).includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
      throw new Error('The installed app uses a different signing key. Build with its original key to update it. The script has not uninstalled the app; its data is retained.');
    }
    throw error;
  }
  run(adbPath, ['-s', serial, 'shell', 'am', 'start', '-W', '-n', `${APP_ID}/.MainActivity`], buildEnv, projectRoot);
  console.log(`Installed ${apk}\nZentra can run without Metro. You can disconnect the phone.`);
}
