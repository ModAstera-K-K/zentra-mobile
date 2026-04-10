import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const appJsonPath = path.join(root, 'app.json');

const blockedDependencies = [
  'axios',
  'apollo-client',
  '@apollo/client',
  'got',
  'superagent',
  'ky',
  'swr',
  '@tanstack/react-query',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const packageJson = readJson(packageJsonPath);
  const appJson = readJson(appJsonPath);
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  const presentBlockedDependencies = blockedDependencies.filter((dependency) => dependency in dependencies);

  if (presentBlockedDependencies.length) {
    throw new Error(`Blocked network dependencies detected: ${presentBlockedDependencies.join(', ')}`);
  }

  const blockedPermissions = appJson.expo?.android?.blockedPermissions ?? [];

  if (!blockedPermissions.includes('android.permission.INTERNET')) {
    throw new Error('app.json must block android.permission.INTERNET');
  }

  console.log('No-network guardrail check passed.');
}

main();
