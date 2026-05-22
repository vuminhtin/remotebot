import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRestartCommand,
  checkPolicy,
  parseArgs,
  resolveService,
  tailFile,
} from '../scripts/remote-steward.mjs';
import { hashPin } from '../src/security/policy.mjs';

test('parseArgs nhận action service apply pin', () => {
  const args = parseArgs([
    '--action', 'restart_service',
    '--service', 'worker',
    '--apply',
    '--pin', '123456',
  ]);
  assert.equal(args.action, 'restart_service');
  assert.equal(args.service, 'worker');
  assert.match(args.config.replaceAll('/', '\\'), /remotebot\.config\.json$/);
  assert.equal(args.lines, 80);
  assert.equal(args.limit, 5);
  assert.equal(args.apply, true);
  assert.equal(args.pin, '123456');
});

test('resolveService chỉ nhận service đã whitelist', () => {
  assert.deepEqual(resolveService({ api: { logFile: 'x.log' } }, 'api'), { logFile: 'x.log' });
  assert.throws(() => resolveService({}, 'api'), /chưa được whitelist/);
});

test('tailFile đọc số dòng cuối', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotebot-tail-'));
  const file = path.join(dir, 'x.log');
  try {
    fs.writeFileSync(file, 'a\nb\nc\n', 'utf8');
    assert.equal(tailFile(file, 2), 'c\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('buildRestartCommand tạo lệnh Windows và systemd từ whitelist', () => {
  const win = buildRestartCommand({ windowsServiceName: "My'Service" }, 'win32');
  assert.equal(win.command, 'powershell.exe');
  assert.match(win.args.at(-1), /My''Service/);

  const linux = buildRestartCommand({ systemdUnit: 'worker.service' }, 'linux');
  assert.deepEqual(linux, { command: 'systemctl', args: ['restart', 'worker.service'] });
});

test('checkPolicy yêu cầu PIN cho restart_service', () => {
  const policy = {
    allowedCommands: ['restart_service'],
    requirePinFor: ['restart_service'],
    pinSha256: hashPin('123456'),
    dangerousTextPatterns: [],
  };
  assert.equal(checkPolicy('restart_service', policy, '123456').decision, 'allow');
  assert.throws(() => checkPolicy('restart_service', policy, '000000'), /PIN/);
});
