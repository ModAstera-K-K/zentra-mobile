import assert from 'node:assert/strict';
import test from 'node:test';
import { installOnPhone, parsePhoneOptions, selectPhone } from '../scripts/android-phone-helpers.mjs';

test('phone selection rejects missing, unauthorized, offline and ambiguous targets', () => {
  assert.throws(() => selectPhone('List of devices attached\n', undefined), /No Android device/);
  assert.throws(() => selectPhone('phone unauthorized\n', undefined), /authorization/);
  assert.throws(() => selectPhone('phone offline\n', undefined), /offline/);
  const multiple = 'List of devices attached\nphone device\nemulator-5554 device\n';
  assert.throws(() => selectPhone(multiple, undefined), /Multiple devices/);
  assert.equal(selectPhone(multiple, 'phone'), 'phone');
  assert.throws(() => selectPhone(multiple, 'missing'), /not connected/);
  assert.throws(() => parsePhoneOptions(['--device']), /incomplete option/);
  assert.throws(() => parsePhoneOptions(['--replace-installed']), /Unknown/);
});

const setup = { projectRoot: '/repo', adbPath: '/sdk/adb', env: { NODE_ENV: 'development' } };

test('the local install bundles production code and targets exactly the requested phone', () => {
  const calls: { command: string; args: string[]; env: Record<string, string> }[] = [];
  installOnPhone(setup, 'phone', (command: string, args: string[], env: Record<string, string>) => {
    calls.push({ command, args, env });
    return 'Success';
  });
  assert.equal(calls.length, 3);
  assert.ok(calls[0].args.includes(':app:assembleRelease'));
  assert.equal(calls[0].env.NODE_ENV, 'production');
  assert.equal(calls[0].env.EXPO_PUBLIC_LOCAL_PERF, '1');
  assert.deepEqual(calls[1].args, ['-s', 'phone', 'install', '-r', '/repo/android/app/build/outputs/apk/release/app-release.apk']);
  assert.deepEqual(calls[2].args.slice(0, 3), ['-s', 'phone', 'shell']);
  assert.equal(calls.some(call => call.args.includes('uninstall')), false);
});

test('a build failure stops before installation; signature conflicts never trigger uninstall', () => {
  let calls = 0;
  assert.throws(() => installOnPhone(setup, 'phone', () => {
    calls++;
    throw new Error('Build failed');
  }), /Build failed/);
  assert.equal(calls, 1);
  calls = 0;
  assert.throws(() => installOnPhone(setup, 'phone', () => {
    if (++calls === 2) throw new Error('INSTALL_FAILED_UPDATE_INCOMPATIBLE');
    return '';
  }), /data is retained/);
  assert.equal(calls, 2);
});
