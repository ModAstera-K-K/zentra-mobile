import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fileExists(targetPath) {
  return Boolean(targetPath) && fs.existsSync(targetPath);
}

function prependPathSegment(currentPath, nextSegment) {
  if (!nextSegment) {
    return currentPath ?? '';
  }

  const parts = (currentPath ?? '').split(path.delimiter).filter(Boolean);

  if (parts.includes(nextSegment)) {
    return [nextSegment, ...parts.filter((part) => part !== nextSegment)].join(path.delimiter);
  }

  return [nextSegment, ...parts].join(path.delimiter);
}

function resolveJavaHomeFromSystem() {
  try {
    const value = execFileSync('/usr/libexec/java_home', ['-v', '17'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return value || null;
  } catch {
    return null;
  }
}

function resolveJavaHome() {
  const preferredJavaHome = resolveJavaHomeFromSystem();

  if (fileExists(preferredJavaHome ? path.join(preferredJavaHome, 'bin', 'java') : '')) {
    return preferredJavaHome;
  }

  const currentJavaHome = process.env.JAVA_HOME;

  if (fileExists(currentJavaHome ? path.join(currentJavaHome, 'bin', 'java') : '')) {
    return currentJavaHome;
  }

  return null;
}

function resolveAndroidSdkRoot() {
  const homeDirectory = os.homedir();
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    path.join(homeDirectory, 'Library', 'Android', 'sdk'),
    path.join(homeDirectory, 'android', 'sdk'),
  ];

  return candidates.find((candidate) => (
    fileExists(candidate ? path.join(candidate, 'platform-tools', 'adb') : '')
  )) ?? null;
}

export function getProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function buildAndroidEnv() {
  const javaHome = resolveJavaHome();
  const androidSdkRoot = resolveAndroidSdkRoot();
  const adbPath = androidSdkRoot ? path.join(androidSdkRoot, 'platform-tools', 'adb') : null;
  let nextPath = process.env.PATH ?? '';

  if (javaHome) {
    nextPath = prependPathSegment(nextPath, path.join(javaHome, 'bin'));
  }

  if (androidSdkRoot) {
    nextPath = prependPathSegment(nextPath, path.join(androidSdkRoot, 'platform-tools'));
    nextPath = prependPathSegment(nextPath, path.join(androidSdkRoot, 'emulator'));
  }

  return {
    adbPath,
    androidSdkRoot,
    env: {
      ...process.env,
      ...(androidSdkRoot
        ? {
          ANDROID_HOME: androidSdkRoot,
          ANDROID_SDK_ROOT: androidSdkRoot,
        }
        : {}),
      ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      ...(javaHome ? { ORG_GRADLE_JAVA_HOME: javaHome } : {}),
      PATH: nextPath,
    },
    javaHome,
  };
}

export function printAndroidEnvSummary() {
  const { adbPath, androidSdkRoot, javaHome } = buildAndroidEnv();

  console.log(`JAVA_HOME=${javaHome ?? 'missing'}`);
  console.log(`ANDROID_SDK_ROOT=${androidSdkRoot ?? 'missing'}`);
  console.log(`ADB=${adbPath ?? 'missing'}`);
}
