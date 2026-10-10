#!/usr/bin/env node
import { buildAndroidEnv, getProjectRoot } from './android-env.mjs';
import { checkPhoneSetup, installOnPhone, parsePhoneOptions } from './android-phone-helpers.mjs';

try {
  const options = parsePhoneOptions(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: npm run android:install -- [--device SERIAL] [--check]

Build, install, and launch the local Release app on one connected Android device.
Java 17 and the Android SDK are detected automatically. Enable USB debugging first.
Uses the project's current signing configuration; never uninstalls existing data.
Local performance logs default to on; set EXPO_PUBLIC_LOCAL_PERF=0 to disable.

  --device SERIAL  Choose a device (also accepts ANDROID_SERIAL).
  --check          Verify setup and device access without building or installing.
  --help           Show this help.`);
  } else {
    const setup = { ...buildAndroidEnv(), projectRoot: getProjectRoot() };
    const serial = checkPhoneSetup(setup, options.serial);
    console.log(`Java: ${setup.javaHome}\nAndroid SDK: ${setup.androidSdkRoot}\nDevice: ${serial}`);
    if (options.check) console.log('Setup is ready. Run npm run android:install to build and install.');
    else installOnPhone(setup, serial);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
